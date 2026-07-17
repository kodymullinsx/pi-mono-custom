import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { hostname, tmpdir } from "os";
import { basename, dirname, join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendPrivateSessionEntry, getSessionFileLockPath } from "../../src/core/session-file-writer.ts";

const DEAD_PID = 2_147_483_647;
const foreignProcessIdentity = vi.hoisted(() => ({
	pid: 1_500_000_001,
	start: "Mon Jan 1 00:00:00 2024",
	reads: 0,
}));

vi.mock("child_process", () => ({
	spawnSync: (_command: string, args: readonly string[]) => {
		const pid = Number(args.at(-1));
		if (pid === foreignProcessIdentity.pid) {
			foreignProcessIdentity.reads++;
			return { status: 0, stdout: `${foreignProcessIdentity.start}\n` };
		}
		return { status: 0, stdout: "Mon Jan 1 00:00:00 2024\n" };
	},
}));

function writeLockOwner(
	lockPath: string,
	target: string,
	owner: { pid: number; startToken: string | null; nonce: string },
): void {
	mkdirSync(lockPath, { mode: 0o700 });
	chmodSync(lockPath, 0o700);
	writeFileSync(
		join(lockPath, `owner-${owner.nonce}.json`),
		`${JSON.stringify({
			version: 1,
			pid: owner.pid,
			startToken: owner.startToken,
			host: hostname(),
			nonce: owner.nonce,
			target,
		})}\n`,
		{ mode: 0o600 },
	);
}

describe.skipIf(process.platform === "win32")("private session file lock recovery", () => {
	let tempDir: string;
	let sessionFile: string;

	beforeEach(() => {
		tempDir = join(
			tmpdir(),
			`session-lock-recovery-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(tempDir, { recursive: true });
		sessionFile = join(tempDir, "session.jsonl");
		writeFileSync(sessionFile, '{"type":"session","version":3,"id":"original","cwd":"/tmp"}\n');
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("cleans a create-before-owner crash candidate without blocking acquisition", () => {
		const lockPath = getSessionFileLockPath(sessionFile);
		const candidate = `${lockPath}.candidate.${DEAD_PID}.unknown.00000000-0000-4000-8000-000000000001`;
		mkdirSync(candidate, { mode: 0o700 });

		appendPrivateSessionEntry(sessionFile, { type: "custom", id: "after-candidate-crash" });

		expect(existsSync(candidate)).toBe(false);
		expect(existsSync(lockPath)).toBe(false);
		expect(readFileSync(sessionFile, "utf8")).toContain('"id":"after-candidate-crash"');
	});

	it("recovers an empty installed lock directory left by interrupted cleanup", () => {
		const lockPath = getSessionFileLockPath(sessionFile);
		mkdirSync(lockPath, { mode: 0o700 });

		appendPrivateSessionEntry(sessionFile, { type: "custom", id: "after-empty-lock" });

		expect(existsSync(lockPath)).toBe(false);
		expect(readFileSync(sessionFile, "utf8")).toContain('"id":"after-empty-lock"');
	});

	it("recovers a lock whose recorded owner process is dead", () => {
		const lockPath = getSessionFileLockPath(sessionFile);
		writeLockOwner(lockPath, realpathSync(sessionFile), {
			pid: DEAD_PID,
			startToken: null,
			nonce: "00000000-0000-4000-8000-000000000002",
		});

		appendPrivateSessionEntry(sessionFile, { type: "custom", id: "after-dead-owner" });

		expect(existsSync(lockPath)).toBe(false);
		expect(readFileSync(sessionFile, "utf8")).toContain('"id":"after-dead-owner"');
	});

	it("treats a live reused pid with a different start token as a dead prior owner", () => {
		const lockPath = getSessionFileLockPath(sessionFile);
		writeLockOwner(lockPath, realpathSync(sessionFile), {
			pid: process.pid,
			startToken: "not-this-process-start-token",
			nonce: "00000000-0000-4000-8000-000000000003",
		});

		appendPrivateSessionEntry(sessionFile, { type: "custom", id: "after-pid-reuse" });

		expect(existsSync(lockPath)).toBe(false);
		expect(readFileSync(sessionFile, "utf8")).toContain('"id":"after-pid-reuse"');
	});

	it.skipIf(process.platform !== "darwin")(
		"refreshes a foreign pid start token before recovering a reused-pid lock",
		() => {
			const firstStart = "Mon Jan 1 00:00:00 2024";
			const reusedStart = "Tue Jan 2 00:00:00 2024";
			foreignProcessIdentity.start = firstStart;
			foreignProcessIdentity.reads = 0;
			const lockPath = getSessionFileLockPath(sessionFile);
			writeLockOwner(lockPath, realpathSync(sessionFile), {
				pid: foreignProcessIdentity.pid,
				startToken: `darwin:${firstStart}`,
				nonce: "00000000-0000-4000-8000-000000000004",
			});
			const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);
			const waitSpy = vi.spyOn(Atomics, "wait").mockImplementation(() => {
				foreignProcessIdentity.start = reusedStart;
				return "timed-out";
			});

			try {
				appendPrivateSessionEntry(sessionFile, { type: "custom", id: "after-foreign-pid-reuse" });
			} finally {
				waitSpy.mockRestore();
				killSpy.mockRestore();
			}

			expect(foreignProcessIdentity.reads).toBe(2);
			expect(existsSync(lockPath)).toBe(false);
			expect(readFileSync(sessionFile, "utf8")).toContain('"id":"after-foreign-pid-reuse"');
		},
	);

	it("uses the real deepest existing ancestor for unresolved target aliases", () => {
		const realParent = join(tempDir, "real-parent");
		const aliasParent = join(tempDir, "alias-parent");
		mkdirSync(realParent);
		symlinkSync(realParent, aliasParent);
		const realTarget = join(realParent, "nested", "future.jsonl");
		const aliasTarget = join(aliasParent, "nested", "future.jsonl");

		expect(getSessionFileLockPath(aliasTarget)).toBe(getSessionFileLockPath(realTarget));
		expect(dirname(getSessionFileLockPath(aliasTarget))).toBe(join(realpathSync(realParent), "nested"));
		expect(basename(getSessionFileLockPath(aliasTarget))).toMatch(/^\.pi-session-lock-[a-f0-9]{32}$/);
	});
});
