import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionFileLockPath, rewritePrivateSessionFile } from "../../src/core/session-file-writer.ts";

const forcedFchmod = vi.hoisted(() =>
	vi.fn(() => {
		throw new Error("forced fchmod failure");
	}),
);

vi.mock("fs", async (importOriginal) => {
	const actual = await importOriginal();
	return { ...(actual as object), fchmodSync: forcedFchmod };
});

describe.skipIf(process.platform === "win32")("private session file hardening failures", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `session-writer-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
		forcedFchmod.mockClear();
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("preserves existing bytes when descriptor hardening fails before rewrite", () => {
		const sessionFile = join(tempDir, "session.jsonl");
		const lockPath = getSessionFileLockPath(sessionFile);
		const original = '{"type":"session","version":3,"id":"original","cwd":"/tmp"}\n';
		writeFileSync(sessionFile, original);
		chmodSync(sessionFile, 0o644);

		expect(() =>
			rewritePrivateSessionFile(sessionFile, [{ type: "session", version: 3, id: "replacement", cwd: "/tmp" }]),
		).toThrow("forced fchmod failure");

		expect(forcedFchmod).toHaveBeenCalledOnce();
		expect(readFileSync(sessionFile, "utf8")).toBe(original);
		expect(statSync(sessionFile).mode & 0o777).toBe(0o644);
		expect(existsSync(lockPath)).toBe(false);
	});
});
