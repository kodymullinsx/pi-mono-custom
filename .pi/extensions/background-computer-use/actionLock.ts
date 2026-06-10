import fs from "node:fs/promises";
import path from "node:path";
import type { BcuExtensionConfig } from "./config.ts";

export interface BcuActionLock {
	lockPath: string;
	ownerId: string;
	release(): Promise<void>;
}

export interface BcuActionLockHolder {
	ownerId?: string;
	pid?: number;
	createdAt?: string;
	expiresAt?: string;
	lockPath: string;
}

export class BcuActionLockError extends Error {
	readonly holder: BcuActionLockHolder;
	readonly lockPath: string;

	constructor(holder: BcuActionLockHolder) {
		super(formatActionLockMessage(holder));
		this.name = "BcuActionLockError";
		this.holder = holder;
		this.lockPath = holder.lockPath;
	}
}

interface LockFile {
	ownerId: string;
	pid: number;
	createdAt: string;
	expiresAt: string;
}

function formatActionLockMessage(holder: BcuActionLockHolder): string {
	const owner = holder.ownerId ? ` by ${holder.ownerId}` : "";
	const pid = holder.pid ? ` pid=${holder.pid}` : "";
	const expiry = holder.expiresAt ? ` until ${holder.expiresAt}` : "";
	return `BackgroundComputerUse action lock is held${owner}${pid}${expiry}. Wait for the other action to finish. If no action is running, remove ${holder.lockPath} and retry.`;
}

function errorCode(error: unknown): string | undefined {
	return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : undefined;
}

function ownerId(): string {
	return `pid:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function lockContent(owner: string, ttlMs: number): LockFile {
	const created = Date.now();
	return {
		ownerId: owner,
		pid: process.pid,
		createdAt: new Date(created).toISOString(),
		expiresAt: new Date(created + ttlMs).toISOString(),
	};
}

function parseLock(raw: string, lockPath: string): BcuActionLockHolder {
	try {
		const value = JSON.parse(raw) as unknown;
		if (typeof value !== "object" || value === null || Array.isArray(value)) return { lockPath };
		return {
			lockPath,
			ownerId: "ownerId" in value && typeof value.ownerId === "string" ? value.ownerId : undefined,
			pid: "pid" in value && typeof value.pid === "number" ? value.pid : undefined,
			createdAt: "createdAt" in value && typeof value.createdAt === "string" ? value.createdAt : undefined,
			expiresAt: "expiresAt" in value && typeof value.expiresAt === "string" ? value.expiresAt : undefined,
		};
	} catch {
		return { lockPath };
	}
}

async function readHolder(lockPath: string): Promise<BcuActionLockHolder> {
	try {
		return parseLock(await fs.readFile(lockPath, "utf8"), lockPath);
	} catch {
		return { lockPath };
	}
}

function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		const code = errorCode(error);
		if (code === "ESRCH") return false;
		return true;
	}
}

function isExpired(holder: BcuActionLockHolder, ttlMs: number, statMtimeMs: number): boolean {
	if (holder.pid !== undefined && isProcessRunning(holder.pid)) return false;
	const expiresAtMs = holder.expiresAt ? Date.parse(holder.expiresAt) : Number.NaN;
	if (Number.isFinite(expiresAtMs)) return expiresAtMs <= Date.now();
	return Date.now() - statMtimeMs > ttlMs;
}

async function tryCreateLock(lockPath: string, owner: string, ttlMs: number): Promise<boolean> {
	await fs.mkdir(path.dirname(lockPath), { recursive: true });
	try {
		await fs.writeFile(lockPath, `${JSON.stringify(lockContent(owner, ttlMs))}\n`, { flag: "wx" });
		return true;
	} catch (error) {
		if (errorCode(error) === "EEXIST") return false;
		throw error;
	}
}

export async function acquireActionLock(config: BcuExtensionConfig): Promise<BcuActionLock> {
	const lockPath = config.actionLockPath;
	const ttlMs = config.actionLockTtlMs;
	const owner = ownerId();

	for (let attempt = 0; attempt < 2; attempt += 1) {
		if (await tryCreateLock(lockPath, owner, ttlMs)) {
			return {
				lockPath,
				ownerId: owner,
				async release() {
					await releaseActionLock(lockPath, owner);
				},
			};
		}

		const [holder, stat] = await Promise.all([readHolder(lockPath), fs.stat(lockPath).catch(() => undefined)]);
		if (stat && isExpired(holder, ttlMs, stat.mtimeMs)) {
			await fs.rm(lockPath, { force: true });
			continue;
		}
		throw new BcuActionLockError(holder);
	}

	throw new BcuActionLockError(await readHolder(lockPath));
}

export async function releaseActionLock(lockPath: string, owner: string): Promise<void> {
	let holder: BcuActionLockHolder;
	try {
		holder = parseLock(await fs.readFile(lockPath, "utf8"), lockPath);
	} catch (error) {
		if (errorCode(error) === "ENOENT") return;
		throw error;
	}
	if (holder.ownerId === owner) await fs.rm(lockPath, { force: true });
}
