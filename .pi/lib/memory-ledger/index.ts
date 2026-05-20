import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, statSync, writeFileSync, renameSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, relative, resolve } from "node:path";

export {
	EVENT_SCHEMA,
	FRICTION_CANDIDATE_SCHEMA,
	PI_COMPACTION_PACKET_SCHEMA,
	PI_COMPACTION_EVENT_SCHEMA,
	ROUTE_TELEMETRY_REPORT_SCHEMA,
	EVENT_TYPES,
	PI_COMPACTION_EVENT_TYPES,
	PACKET_STATUSES,
	FRICTION_PATTERN_STRINGS,
	SECRET_PATTERN_STRINGS,
} from "./constants.mjs";

import { EVENT_SCHEMA, SECRET_PATTERN_STRINGS } from "./constants.mjs";

const SECRET_PATTERNS = SECRET_PATTERN_STRINGS.map((pattern) => new RegExp(pattern, "i"));

const LOCK_RETRY_BUDGET_MS = 25;
const LOCK_STALE_MS = 30_000;

export type MemoryEvent = {
	schema: typeof EVENT_SCHEMA;
	id: string;
	type: string;
	created_at: string;
	session_id: string;
	turn_id: number | null;
	source: {
		hook: string;
		path: string;
	};
	payload: Record<string, unknown>;
};

export function ledgerDisabled(): boolean {
	const raw = process.env.PI_MEMORY_LEDGER_OFF ?? "";
	return !["", "0", "false", "no", "off"].includes(raw.trim().toLowerCase());
}

function envPath(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
}

export function getAgentRoot(): string {
	return resolve(envPath("PI_CODING_AGENT_DIR") || `${homedir()}/.pi/agent`);
}

export function getMemoryRoot(): string {
	return resolve(envPath("PI_MEMORY_LEDGER_ROOT") || `${getAgentRoot()}/memory`);
}

export function safeName(value: string, fallback = "unknown"): string {
	const cleaned = value.trim().split("").map((char) => /[A-Za-z0-9._-]/.test(char) ? char : "_").join("");
	return cleaned.slice(0, 128) || fallback;
}

export function hashText(text: string): string {
	return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

export function excerpt(text: string, limit = 200): string {
	const compact = text.split(/\s+/).filter(Boolean).join(" ");
	if (compact.length <= limit) return compact;
	return `${compact.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function containsLikelySecret(text: string): boolean {
	return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

export function safeExcerpt(text: string, limit = 200, placeholder = "[redacted: possible secret-bearing text]"): string {
	return containsLikelySecret(text) ? placeholder : excerpt(text, limit);
}

export function ensureMemoryPath(path: string): string {
	const root = getMemoryRoot();
	const target = resolve(path);
	if (target !== root && !target.startsWith(`${root}/`)) {
		throw new Error(`refusing memory ledger write outside ${root}: ${target}`);
	}
	return target;
}

function nowIso(): string {
	return new Date().toISOString();
}

function logError(message: string): void {
	try {
		const logPath = ensureMemoryPath(`${getMemoryRoot()}/state/ledger-errors.log`);
		mkdirSync(dirname(logPath), { recursive: true });
		appendFileSync(logPath, `${nowIso()} ${message}\n`, "utf-8");
	} catch (error) {
		console.warn(`[pi-memory-ledger] ${message}`);
		console.warn(`[pi-memory-ledger] failed to write ledger error log: ${error instanceof Error ? error.message : String(error)}`);
	}
}

function sleepSync(ms: number): void {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		// Small busy wait keeps the helper dependency-free and bounded to milliseconds.
	}
}

function withLock<T>(lockPath: string, action: () => T): T | undefined {
	const started = Date.now();
	const target = ensureMemoryPath(lockPath);
	mkdirSync(dirname(target), { recursive: true });
	while (Date.now() - started <= LOCK_RETRY_BUDGET_MS) {
		let fd: number | undefined;
		try {
			fd = openSync(target, "wx");
			writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: nowIso() }), "utf-8");
			try {
				return action();
			} finally {
				if (fd !== undefined) closeSync(fd);
				try {
					unlinkSync(target);
				} catch {
					// best-effort lock cleanup
				}
			}
		} catch (error) {
			if (fd !== undefined) {
				try { closeSync(fd); } catch { /* best effort */ }
			}
			const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code) : "";
			if (code !== "EEXIST") throw error;
			try {
				const info = statSync(target);
				if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
					try {
						unlinkSync(target);
					} catch (unlinkError) {
						logError(`withLock failed to remove stale lock at ${target}: ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`);
					}
				}
			} catch {
				// another process may have removed the lock
			}
			sleepSync(2);
		}
	}
	return undefined;
}

export function memoryRelativePath(path: string): string {
	const root = getMemoryRoot();
	const target = ensureMemoryPath(path);
	const rel = relative(root, target);
	return rel || ".";
}

export function writeFileAtomic(path: string, text: string): boolean {
	const target = resolve(path);
	const tmp = `${target}.tmp.${process.pid}.${randomUUID().slice(0, 8)}`;
	try {
		mkdirSync(dirname(target), { recursive: true });
		writeFileSync(tmp, text, "utf-8");
		renameSync(tmp, target);
		return true;
	} catch (error) {
		try {
			if (existsSync(tmp)) unlinkSync(tmp);
		} catch {
			// best-effort cleanup
		}
		logError(`writeFileAtomic failed at ${target}: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
}

export function writeTextAtomic(path: string, text: string): boolean {
	if (ledgerDisabled()) return false;
	let target: string;
	try {
		target = ensureMemoryPath(path);
	} catch (error) {
		logError(`writeTextAtomic refused path ${path}: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
	return writeFileAtomic(target, text);
}

function eventId(sessionId: string, turnId: number | null, createdNs: bigint): string {
	return `event:${safeName(sessionId, "_")}:${turnId ?? "_"}:${createdNs}:${randomUUID().slice(0, 8)}`;
}

function ledgerPath(sessionId: string, created: Date): string {
	const date = created.toISOString().slice(0, 10);
	const safeSession = safeName(sessionId, "");
	if (safeSession) return `${getMemoryRoot()}/events/sessions/${date}/${safeSession}.jsonl`;
	return `${getMemoryRoot()}/events/unknown-session/${date}.jsonl`;
}

export function appendEvent(
	eventType: string,
	payload: Record<string, unknown>,
	options: { sessionId: string; turnId?: number | null; sourceHook: string; sourcePath?: string },
): void {
	if (ledgerDisabled()) return;
	try {
		const created = new Date();
		const createdNs = process.hrtime.bigint();
		const event: MemoryEvent = {
			schema: EVENT_SCHEMA,
			id: eventId(options.sessionId || "", options.turnId ?? null, createdNs),
			type: eventType,
			created_at: created.toISOString(),
			session_id: options.sessionId || "",
			turn_id: options.turnId ?? null,
			source: {
				hook: options.sourceHook,
				path: options.sourcePath || "",
			},
			payload,
		};
		const path = ensureMemoryPath(ledgerPath(options.sessionId || "", created));
		const lockPath = ensureMemoryPath(`${getMemoryRoot()}/state/ledger.lock`);
		mkdirSync(dirname(path), { recursive: true });
		const wrote = withLock(lockPath, () => {
			appendFileSync(path, `${JSON.stringify(event)}\n`, "utf-8");
			return true;
		});
		if (!wrote) logError(`appendEvent dropped type=${eventType}: lock timeout`);
	} catch (error) {
		logError(`appendEvent failed type=${eventType}: ${error instanceof Error ? error.message : String(error)}`);
	}
}
