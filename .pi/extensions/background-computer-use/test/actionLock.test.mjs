import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BcuActionLockError, acquireActionLock } from "../actionLock.ts";

async function withTempDir(fn) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "bcu-lock-"));
	try {
		return await fn(root);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
}

function config(lockPath, ttlMs = 30_000) {
	return {
		manifestPath: "/tmp/background-computer-use/runtime-manifest.json",
		manifestCandidatePaths: ["/tmp/background-computer-use/runtime-manifest.json"],
		timeoutMs: 1000,
		startTimeoutMs: 5000,
		debug: false,
		enableActions: true,
		autoStart: false,
		maxImageBytes: 1024 * 1024,
		actionLockPath: lockPath,
		actionLockTtlMs: ttlMs,
	};
}

test("action locks acquire and release atomically", async () => {
	await withTempDir(async (root) => {
		const lockPath = path.join(root, "action.lock");
		const lock = await acquireActionLock(config(lockPath));
		assert.equal(await fs.readFile(lockPath, "utf8").then(Boolean), true);
		await lock.release();
		await assert.rejects(fs.access(lockPath));
	});
});

test("action locks block concurrent holders", async () => {
	await withTempDir(async (root) => {
		const lockPath = path.join(root, "action.lock");
		const lock = await acquireActionLock(config(lockPath));
		try {
			await assert.rejects(acquireActionLock(config(lockPath)), (error) => {
				assert.ok(error instanceof BcuActionLockError);
				assert.equal(error.lockPath, lockPath);
				assert.match(error.message, /action lock is held/);
				return true;
			});
		} finally {
			await lock.release();
		}
	});
});

test("stale action locks are replaced", async () => {
	await withTempDir(async (root) => {
		const lockPath = path.join(root, "action.lock");
		await fs.writeFile(
			lockPath,
			JSON.stringify({
				ownerId: "old-owner",
				pid: 999999,
				createdAt: "2000-01-01T00:00:00.000Z",
				expiresAt: "2000-01-01T00:00:01.000Z",
			}),
		);
		const lock = await acquireActionLock(config(lockPath));
		try {
			const raw = await fs.readFile(lockPath, "utf8");
			assert.doesNotMatch(raw, /old-owner/);
		} finally {
			await lock.release();
		}
	});
});

test("expired action locks are not replaced while the holder process is alive", async () => {
	await withTempDir(async (root) => {
		const lockPath = path.join(root, "action.lock");
		await fs.writeFile(
			lockPath,
			JSON.stringify({
				ownerId: "active-owner",
				pid: process.pid,
				createdAt: "2000-01-01T00:00:00.000Z",
				expiresAt: "2000-01-01T00:00:01.000Z",
			}),
		);
		await assert.rejects(acquireActionLock(config(lockPath)), (error) => {
			assert.ok(error instanceof BcuActionLockError);
			assert.equal(error.holder.pid, process.pid);
			return true;
		});
		const raw = await fs.readFile(lockPath, "utf8");
		assert.match(raw, /active-owner/);
	});
});

test("releasing one holder does not remove a replacement holder", async () => {
	await withTempDir(async (root) => {
		const lockPath = path.join(root, "action.lock");
		const lock = await acquireActionLock(config(lockPath));
		await fs.writeFile(lockPath, JSON.stringify({ ownerId: "new-owner", pid: 2, createdAt: "now", expiresAt: "later" }));
		await lock.release();
		const raw = await fs.readFile(lockPath, "utf8");
		assert.match(raw, /new-owner/);
	});
});
