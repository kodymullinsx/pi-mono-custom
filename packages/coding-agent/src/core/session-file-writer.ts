import { spawnSync } from "child_process";
import { createHash, randomUUID } from "crypto";
import {
	chmodSync,
	closeSync,
	type Dirent,
	fchmodSync,
	fsyncSync,
	ftruncateSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readlinkSync,
	realpathSync,
	renameSync,
	rmdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "fs";
import { hostname } from "os";
import { basename, dirname, join, resolve } from "path";

const SESSION_FILE_MODE = 0o600;
const SESSION_LOCK_DIR_MODE = 0o700;
const SESSION_LOCK_OWNER_MODE = 0o600;
const SESSION_LOCK_RETRY_DELAY_MS = 10;
const SESSION_LOCK_MAX_ATTEMPTS = 3000;
const SESSION_LOCK_OWNER_MAX_BYTES = 4096;
const START_TOKEN_HASH_PATTERN = /^(?:unknown|[a-f0-9]{16})$/;
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sessionLockWaitState = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
const currentHostname = hostname();
let currentProcessStartToken: string | null | undefined;
const cleanedCandidateLocks = new Set<string>();

type SessionWriteMode = "append" | "create" | "rewrite";
type OwnerState = "alive" | "dead" | "unknown";

interface SessionLockOwner {
	version: 1;
	pid: number;
	startToken: string | null;
	host: string;
	nonce: string;
	target: string;
}

interface SessionLockLocation {
	target: string;
	directory: string;
	candidatePrefix: string;
}

interface ObservedLock {
	owner: SessionLockOwner;
	ownerName: string;
}

export interface LockedSessionFile {
	rewrite(entries: Iterable<unknown>): void;
}

function getErrorCode(error: unknown): string | undefined {
	return typeof error === "object" && error !== null && "code" in error
		? String((error as { code?: unknown }).code)
		: undefined;
}

function isMissingPathError(error: unknown): boolean {
	return getErrorCode(error) === "ENOENT";
}

function isLockDestinationExistsError(error: unknown): boolean {
	const code = getErrorCode(error);
	return code === "EEXIST" || code === "ENOTEMPTY";
}

function canonicalizeSessionTarget(path: string, resolvingSymlinks: Set<string> = new Set()): string {
	let current = resolve(path);
	const unresolved: string[] = [];
	while (true) {
		try {
			return join(realpathSync(current), ...unresolved);
		} catch (error) {
			if (!isMissingPathError(error)) {
				throw error;
			}
		}

		try {
			if (lstatSync(current).isSymbolicLink()) {
				if (resolvingSymlinks.has(current)) {
					throw new Error(`Cannot lock session path with a symlink cycle: ${path}`);
				}
				resolvingSymlinks.add(current);
				const linkTarget = resolve(dirname(current), readlinkSync(current));
				return canonicalizeSessionTarget(join(linkTarget, ...unresolved), resolvingSymlinks);
			}
		} catch (error) {
			if (!isMissingPathError(error)) {
				throw error;
			}
		}

		const parent = dirname(current);
		if (parent === current) {
			throw new Error(`Cannot resolve a lock identity for session path: ${path}`);
		}
		unresolved.unshift(basename(current));
		current = parent;
	}
}

function hash(value: string, length: number): string {
	return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function getSessionLockLocation(path: string): SessionLockLocation {
	const target = canonicalizeSessionTarget(path);
	const directory = join(dirname(target), `.pi-session-lock-${hash(target, 32)}`);
	return { target, directory, candidatePrefix: `${basename(directory)}.candidate.` };
}

export function getSessionFileLockPath(path: string): string {
	return getSessionLockLocation(path).directory;
}

function readProcessStartToken(pid: number): string | undefined {
	if (process.platform === "linux") {
		try {
			const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
			const commandEnd = stat.lastIndexOf(")");
			const fields =
				commandEnd >= 0
					? stat
							.slice(commandEnd + 1)
							.trim()
							.split(/\s+/)
					: [];
			const startTime = fields[19];
			return startTime ? `linux:${startTime}` : undefined;
		} catch (error) {
			if (!isMissingPathError(error)) {
				return undefined;
			}
			return undefined;
		}
	}

	const result = spawnSync(process.platform === "darwin" ? "/bin/ps" : "ps", ["-o", "lstart=", "-p", String(pid)], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	});
	if (result.status !== 0 || typeof result.stdout !== "string") {
		return undefined;
	}
	const start = result.stdout.trim().replace(/\s+/g, " ");
	return start ? `${process.platform}:${start}` : undefined;
}

function getProcessStartToken(pid: number): string | undefined {
	if (pid !== process.pid) {
		return readProcessStartToken(pid);
	}
	if (currentProcessStartToken === undefined) {
		currentProcessStartToken = readProcessStartToken(pid) ?? null;
	}
	return currentProcessStartToken ?? undefined;
}

function getProcessLiveness(pid: number): OwnerState {
	try {
		process.kill(pid, 0);
		return "alive";
	} catch (error) {
		if (getErrorCode(error) === "ESRCH") return "dead";
		if (getErrorCode(error) === "EPERM") return "alive";
		return "unknown";
	}
}

function getOwnerState(owner: Pick<SessionLockOwner, "pid" | "startToken" | "host">): OwnerState {
	if (owner.host !== currentHostname) return "unknown";
	const liveness = getProcessLiveness(owner.pid);
	if (liveness !== "alive" || owner.startToken === null) return liveness;
	const currentStartToken = getProcessStartToken(owner.pid);
	if (currentStartToken === undefined) return "unknown";
	return currentStartToken === owner.startToken ? "alive" : "dead";
}

function candidateOwnerState(pid: number, startTokenHash: string): OwnerState {
	const liveness = getProcessLiveness(pid);
	if (liveness !== "alive" || startTokenHash === "unknown") return liveness;
	const currentStartToken = getProcessStartToken(pid);
	if (currentStartToken === undefined) return "unknown";
	return hash(currentStartToken, 16) === startTokenHash ? "alive" : "dead";
}

function cleanupDeadCandidates(location: SessionLockLocation): void {
	const parent = dirname(location.directory);
	let entries: Dirent[];
	try {
		entries = readdirSync(parent, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (!entry.isDirectory() || !entry.name.startsWith(location.candidatePrefix)) continue;
		const identity = entry.name.slice(location.candidatePrefix.length).split(".");
		if (identity.length !== 3) continue;
		const pid = Number(identity[0]);
		if (
			!Number.isSafeInteger(pid) ||
			pid <= 0 ||
			!START_TOKEN_HASH_PATTERN.test(identity[1]) ||
			!UUID_PATTERN.test(identity[2])
		) {
			continue;
		}
		if (candidateOwnerState(pid, identity[1]) === "dead") {
			rmSync(join(parent, entry.name), { recursive: true, force: true });
		}
	}
}

function writeOwnerFile(path: string, owner: SessionLockOwner): void {
	const fd = openSync(path, "wx", SESSION_LOCK_OWNER_MODE);
	try {
		chmodSync(path, SESSION_LOCK_OWNER_MODE);
		writeFileSync(fd, `${JSON.stringify(owner)}\n`);
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
}

function createLockCandidate(location: SessionLockLocation): {
	directory: string;
	owner: SessionLockOwner;
	ownerName: string;
} {
	const startToken = getProcessStartToken(process.pid) ?? null;
	const nonce = randomUUID();
	const startTokenHash = startToken ? hash(startToken, 16) : "unknown";
	const directory = join(
		dirname(location.directory),
		`${location.candidatePrefix}${process.pid}.${startTokenHash}.${nonce}`,
	);
	const owner: SessionLockOwner = {
		version: 1,
		pid: process.pid,
		startToken,
		host: currentHostname,
		nonce,
		target: location.target,
	};
	const ownerName = `owner-${nonce}.json`;
	try {
		mkdirSync(directory, { mode: SESSION_LOCK_DIR_MODE });
		chmodSync(directory, SESSION_LOCK_DIR_MODE);
		writeOwnerFile(join(directory, ownerName), owner);
		return { directory, owner, ownerName };
	} catch (error) {
		rmSync(directory, { recursive: true, force: true });
		throw error;
	}
}

function observeLock(location: SessionLockLocation): ObservedLock | "empty" | "missing" | "unknown" {
	let entries: Dirent[];
	try {
		if (!lstatSync(location.directory).isDirectory()) return "unknown";
		entries = readdirSync(location.directory, { withFileTypes: true });
	} catch (error) {
		return isMissingPathError(error) ? "missing" : "unknown";
	}
	if (entries.length === 0) return "empty";
	const owners = entries.filter((entry) => entry.isFile() && /^owner-[A-Za-z0-9-]+\.json$/.test(entry.name));
	if (owners.length !== 1 || entries.length !== 1) return "unknown";
	const ownerName = owners[0].name;
	try {
		const ownerPath = join(location.directory, ownerName);
		if (lstatSync(ownerPath).size > SESSION_LOCK_OWNER_MAX_BYTES) return "unknown";
		const parsed = JSON.parse(readFileSync(ownerPath, "utf8")) as Partial<SessionLockOwner>;
		if (
			parsed.version !== 1 ||
			!Number.isSafeInteger(parsed.pid) ||
			(parsed.pid ?? 0) <= 0 ||
			(parsed.startToken !== null && typeof parsed.startToken !== "string") ||
			typeof parsed.host !== "string" ||
			typeof parsed.nonce !== "string" ||
			!UUID_PATTERN.test(parsed.nonce) ||
			typeof parsed.target !== "string" ||
			ownerName !== `owner-${parsed.nonce}.json` ||
			parsed.target !== location.target
		) {
			return "unknown";
		}
		return { owner: parsed as SessionLockOwner, ownerName };
	} catch {
		return "unknown";
	}
}

function removeEmptyLockDirectory(path: string): void {
	try {
		rmdirSync(path);
	} catch (error) {
		const code = getErrorCode(error);
		if (code !== "ENOENT" && code !== "ENOTEMPTY" && code !== "EEXIST") {
			throw error;
		}
	}
}

function recoverDeadLock(location: SessionLockLocation, observed: ObservedLock): void {
	const ownerPath = join(location.directory, observed.ownerName);
	try {
		unlinkSync(ownerPath);
	} catch (error) {
		if (!isMissingPathError(error)) throw error;
		return;
	}
	removeEmptyLockDirectory(location.directory);
}

function releaseLock(location: SessionLockLocation, owner: SessionLockOwner, ownerName: string): void {
	const observed = observeLock(location);
	if (
		typeof observed === "string" ||
		observed.owner.nonce !== owner.nonce ||
		observed.owner.pid !== owner.pid ||
		observed.owner.startToken !== owner.startToken
	) {
		throw Object.assign(new Error(`Session lock ownership was compromised: ${location.directory}`), {
			code: "ECOMPROMISED",
		});
	}
	unlinkSync(join(location.directory, ownerName));
	removeEmptyLockDirectory(location.directory);
}

function acquireSessionFileLock(path: string): () => void {
	const location = getSessionLockLocation(path);
	if (!cleanedCandidateLocks.has(location.directory)) {
		cleanupDeadCandidates(location);
		cleanedCandidateLocks.add(location.directory);
	}
	const candidate = createLockCandidate(location);
	let acquired = false;
	try {
		for (let attempt = 1; attempt <= SESSION_LOCK_MAX_ATTEMPTS; attempt++) {
			try {
				renameSync(candidate.directory, location.directory);
				acquired = true;
				return () => releaseLock(location, candidate.owner, candidate.ownerName);
			} catch (error) {
				if (!isLockDestinationExistsError(error)) throw error;
			}

			const observed = observeLock(location);
			if (observed === "empty") {
				removeEmptyLockDirectory(location.directory);
			} else if (typeof observed !== "string" && getOwnerState(observed.owner) === "dead") {
				recoverDeadLock(location, observed);
			}

			if (attempt === SESSION_LOCK_MAX_ATTEMPTS) {
				throw Object.assign(new Error(`Timed out waiting for session lock: ${location.target}`), {
					code: "ELOCKED",
				});
			}
			Atomics.wait(sessionLockWaitState, 0, 0, SESSION_LOCK_RETRY_DELAY_MS);
		}
		throw new Error(`Failed to acquire session lock: ${location.target}`);
	} finally {
		if (!acquired) {
			rmSync(candidate.directory, { recursive: true, force: true });
		}
	}
}

function openRewriteDescriptor(path: string): { fd: number; truncate: boolean } {
	try {
		return { fd: openSync(path, "r+"), truncate: true };
	} catch (error) {
		if (!isMissingPathError(error)) {
			throw error;
		}
		try {
			return { fd: openSync(path, "wx", SESSION_FILE_MODE), truncate: false };
		} catch (createError) {
			if (getErrorCode(createError) !== "EEXIST") {
				throw createError;
			}
			return { fd: openSync(path, "r+"), truncate: true };
		}
	}
}

function writeWithPrivateDescriptor(path: string, mode: SessionWriteMode, entries: Iterable<unknown>): void {
	const opened =
		mode === "rewrite"
			? openRewriteDescriptor(path)
			: { fd: openSync(path, mode === "append" ? "a" : "wx", SESSION_FILE_MODE), truncate: false };
	try {
		fchmodSync(opened.fd, SESSION_FILE_MODE);
		if (opened.truncate) {
			ftruncateSync(opened.fd, 0);
		}
		for (const entry of entries) {
			writeFileSync(opened.fd, `${JSON.stringify(entry)}\n`);
		}
	} finally {
		closeSync(opened.fd);
	}
}

export function appendPrivateSessionEntry(path: string, entry: unknown): void {
	const release = acquireSessionFileLock(path);
	try {
		writeWithPrivateDescriptor(path, "append", [entry]);
	} finally {
		release();
	}
}

export function rewritePrivateSessionFile(path: string, entries: Iterable<unknown>): void {
	withLockedSessionFile(path, (sessionFile) => sessionFile.rewrite(entries));
}

export function createPrivateSessionFile(path: string, entries: Iterable<unknown>): void {
	const release = acquireSessionFileLock(path);
	try {
		writeWithPrivateDescriptor(path, "create", entries);
	} finally {
		release();
	}
}

export function withLockedSessionFile<T>(path: string, callback: (sessionFile: LockedSessionFile) => T): T {
	const release = acquireSessionFileLock(path);
	try {
		return callback({
			rewrite: (entries) => writeWithPrivateDescriptor(path, "rewrite", entries),
		});
	} finally {
		release();
	}
}
