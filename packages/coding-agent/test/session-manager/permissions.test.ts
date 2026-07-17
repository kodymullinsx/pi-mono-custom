import { spawn } from "child_process";
import {
	chmodSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	utimesSync,
	writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV_AGENT_DIR } from "../../src/config.ts";
import { getSessionFileLockPath } from "../../src/core/session-file-writer.ts";
import { getDefaultSessionDir, SessionManager } from "../../src/core/session-manager.ts";

function mode(path: string): number {
	return statSync(path).mode & 0o777;
}

function withUmask<T>(mask: number, callback: () => T): T {
	const previous = process.umask(mask);
	try {
		return callback();
	} finally {
		process.umask(previous);
	}
}

function appendPersistedConversation(session: SessionManager): string {
	session.appendMessage({ role: "user", content: "hello", timestamp: Date.now() });
	return session.appendMessage({
		role: "assistant",
		content: [{ type: "text", text: "hello" }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	});
}

function requireSessionFile(session: SessionManager): string {
	const sessionFile = session.getSessionFile();
	if (!sessionFile) {
		throw new Error("Expected persisted session file");
	}
	return sessionFile;
}

function runConcurrentAppender(
	workerPath: string,
	sessionFile: string,
	workerId: string,
	startedPath?: string,
	completedPath?: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[workerPath, sessionFile, workerId, ...(startedPath ? [startedPath, completedPath ?? ""] : [])],
			{
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		let stderr = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Appender ${workerId} exited ${code}: ${stderr}`));
			}
		});
	});
}

function runRewriteWorker(
	workerPath: string,
	sessionFile: string,
	cwd: string,
	readyPath: string,
	releasePath: string,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [workerPath, sessionFile, cwd, readyPath, releasePath], {
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stderr = "";
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Rewrite worker exited ${code}: ${stderr}`));
			}
		});
	});
}

async function waitForPath(path: string): Promise<void> {
	const deadline = Date.now() + 5000;
	while (!statPathExists(path)) {
		if (Date.now() >= deadline) {
			throw new Error(`Timed out waiting for ${path}`);
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

function statPathExists(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch (error) {
		if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

describe.skipIf(process.platform === "win32")("SessionManager private persistence permissions", () => {
	let tempDir: string;
	let cwd: string;

	beforeEach(() => {
		tempDir = join(
			tmpdir(),
			`session-permissions-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		cwd = join(tempDir, "project");
		mkdirSync(cwd, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("creates default session directories at 0700 and repairs permissive directories", () => {
		const agentDir = join(tempDir, "agent");
		const sessionDir = withUmask(0o022, () => getDefaultSessionDir(cwd, agentDir));
		expect(mode(sessionDir)).toBe(0o700);

		chmodSync(sessionDir, 0o755);
		expect(getDefaultSessionDir(cwd, agentDir)).toBe(sessionDir);
		expect(mode(sessionDir)).toBe(0o700);
	});

	it("creates default session files at 0600 under umask 0022", () => {
		const originalAgentDir = process.env[ENV_AGENT_DIR];
		process.env[ENV_AGENT_DIR] = join(tempDir, "agent");
		try {
			withUmask(0o022, () => {
				const session = SessionManager.create(cwd);
				appendPersistedConversation(session);
				expect(mode(session.getSessionDir())).toBe(0o700);
				expect(mode(requireSessionFile(session))).toBe(0o600);
			});
		} finally {
			if (originalAgentDir === undefined) {
				delete process.env[ENV_AGENT_DIR];
			} else {
				process.env[ENV_AGENT_DIR] = originalAgentDir;
			}
		}
	});

	it("repairs a permissive session file on append", () => {
		const sessionDir = join(tempDir, "sessions");
		mkdirSync(sessionDir, { mode: 0o750 });
		const session = SessionManager.create(cwd, sessionDir);
		appendPersistedConversation(session);
		const sessionFile = requireSessionFile(session);

		chmodSync(sessionFile, 0o644);
		session.appendCustomEntry("permission-test", { operation: "append" });

		expect(mode(sessionFile)).toBe(0o600);
		expect(readFileSync(sessionFile, "utf8")).toContain('"operation":"append"');
	});

	it("repairs a permissive session file on migration rewrite without changing its identity", () => {
		const sessionDir = join(tempDir, "sessions");
		mkdirSync(sessionDir);
		const session = SessionManager.create(cwd, sessionDir, { id: "rewrite-test" });
		appendPersistedConversation(session);
		const sessionFile = requireSessionFile(session);
		const entries = readFileSync(sessionFile, "utf8")
			.trimEnd()
			.split("\n")
			.map((line) => JSON.parse(line) as Record<string, unknown>);
		entries[0].version = 2;
		writeFileSync(sessionFile, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
		chmodSync(sessionFile, 0o644);

		const reopened = SessionManager.open(sessionFile, sessionDir);

		expect(reopened.getSessionId()).toBe("rewrite-test");
		expect(reopened.getHeader()?.version).toBe(3);
		expect(mode(sessionFile)).toBe(0o600);
	});

	it("creates branched and forked session files at 0600", () => {
		const sessionDir = join(tempDir, "sessions");
		mkdirSync(sessionDir, { mode: 0o750 });
		const session = SessionManager.create(cwd, sessionDir);
		const assistantId = appendPersistedConversation(session);

		const branchedFile = session.createBranchedSession(assistantId);
		if (!branchedFile) {
			throw new Error("Expected branched session file");
		}
		expect(mode(branchedFile)).toBe(0o600);

		const forkDir = join(tempDir, "forks");
		mkdirSync(forkDir, { mode: 0o750 });
		const fork = SessionManager.forkFrom(branchedFile, join(tempDir, "fork-project"), forkDir);
		expect(mode(requireSessionFile(fork))).toBe(0o600);
		expect(mode(forkDir)).toBe(0o750);
	});

	it("preserves an explicit custom directory mode while keeping its session file private", () => {
		const sessionDir = join(tempDir, "shared-sessions");
		mkdirSync(sessionDir, { mode: 0o750 });
		chmodSync(sessionDir, 0o750);

		const session = withUmask(0o022, () => SessionManager.create(cwd, sessionDir));
		appendPersistedConversation(session);

		expect(mode(sessionDir)).toBe(0o750);
		expect(mode(requireSessionFile(session))).toBe(0o600);
	});

	it("keeps every entry and repairs permissions under concurrent appenders", async () => {
		const sessionDir = join(tempDir, "sessions");
		mkdirSync(sessionDir);
		const session = SessionManager.create(cwd, sessionDir);
		appendPersistedConversation(session);
		const sessionFile = requireSessionFile(session);
		chmodSync(sessionFile, 0o644);

		const workerPath = fileURLToPath(new URL("./permissions-append-worker.ts", import.meta.url));
		const workerIds = Array.from({ length: 8 }, (_, index) => `worker-${index}`);
		await Promise.all(workerIds.map((workerId) => runConcurrentAppender(workerPath, sessionFile, workerId)));

		const reopened = SessionManager.open(sessionFile, sessionDir);
		const observedWorkerIds = reopened
			.getEntries()
			.filter((entry) => entry.type === "custom" && entry.customType === "permission-concurrency")
			.map((entry) => (entry.type === "custom" ? (entry.data as { workerId: string }).workerId : ""));
		expect(new Set(observedWorkerIds)).toEqual(new Set(workerIds));
		expect(mode(sessionFile)).toBe(0o600);
	});

	it("serializes real-path append behind symlink rewrite even when lock timestamps are ancient", async () => {
		const sessionDir = join(tempDir, "sessions");
		mkdirSync(sessionDir);
		const session = SessionManager.create(cwd, sessionDir);
		appendPersistedConversation(session);
		const sessionFile = requireSessionFile(session);
		const sessionAlias = join(tempDir, "session-alias.jsonl");
		symlinkSync(sessionFile, sessionAlias);
		const rewriteReady = join(tempDir, "rewrite-ready");
		const releaseRewrite = join(tempDir, "release-rewrite");
		const appendStarted = join(tempDir, "append-started");
		const appendCompleted = join(tempDir, "append-completed");
		const rewriteWorker = fileURLToPath(new URL("./permissions-rewrite-worker.ts", import.meta.url));
		const appendWorker = fileURLToPath(new URL("./permissions-append-worker.ts", import.meta.url));

		const rewriteCompletion = runRewriteWorker(rewriteWorker, sessionAlias, cwd, rewriteReady, releaseRewrite);
		await waitForPath(rewriteReady);
		const realLockPath = getSessionFileLockPath(sessionFile);
		const aliasLockPath = getSessionFileLockPath(sessionAlias);
		expect(aliasLockPath).toBe(realLockPath);
		expect(statPathExists(realLockPath)).toBe(true);
		expect(mode(realLockPath)).toBe(0o700);
		const ancient = new Date(0);
		for (const ownerFile of readdirSync(realLockPath)) {
			utimesSync(join(realLockPath, ownerFile), ancient, ancient);
		}
		utimesSync(realLockPath, ancient, ancient);

		const appendCompletion = runConcurrentAppender(
			appendWorker,
			sessionFile,
			"append-during-rewrite",
			appendStarted,
			appendCompleted,
		);
		await waitForPath(appendStarted);
		await new Promise((resolve) => setTimeout(resolve, 100));
		const appendWasBlocked = !statPathExists(appendCompleted);
		writeFileSync(releaseRewrite, "release");
		await Promise.all([rewriteCompletion, appendCompletion]);

		const reopened = SessionManager.open(sessionFile, sessionDir);
		const customTypes = reopened
			.getEntries()
			.filter((entry) => entry.type === "custom")
			.map((entry) => (entry.type === "custom" ? entry.customType : ""));
		expect(appendWasBlocked).toBe(true);
		expect(customTypes).toEqual(["permission-rewrite", "permission-concurrency"]);
		expect(statPathExists(realLockPath)).toBe(false);
		expect(mode(sessionFile)).toBe(0o600);
	});
});
