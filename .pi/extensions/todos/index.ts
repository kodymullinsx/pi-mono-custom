/**
 * This extension stores todo items as files under <todo-dir> (defaults to .pi/todos,
 * or the path in PI_TODO_PATH).  Each todo is a standalone markdown file named
 * <id>.md and an optional <id>.lock file is used while a session is editing it.
 *
 * File format in .pi/todos:
 * - The file starts with a JSON object (not YAML) containing the front matter:
 *   { id, title, tags, status, created_at, assigned_to_session }
 * - After the JSON block comes optional markdown body text separated by a blank line.
 * - Example:
 *   {
 *     "id": "deadbeef",
 *     "title": "Add tests",
 *     "tags": ["qa"],
 *     "status": "open",
 *     "created_at": "2026-01-25T17:00:00.000Z",
 *     "assigned_to_session": "session.json"
 *   }
 *
 *   Notes about the work go here.
 *
 * Todo storage settings are kept in <todo-dir>/settings.json.
 * Defaults:
 * {
 *   "gc": true,   // delete closed todos older than gcDays on startup
 *   "gcDays": 7   // age threshold for GC (days since created_at)
 * }
 *
 * The todo tool manages file-backed work items, and this extension also renders
 * a compact live widget in the terminal when todos exist.
 */
import { keyHint, type ExtensionAPI, type ExtensionContext, type Theme } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import crypto from "node:crypto";
import {
	Key,
	Text,
	truncateToWidth,
} from "@mariozechner/pi-tui";

const TODO_DIR_NAME = ".pi/todos";
const TODO_PATH_ENV = "PI_TODO_PATH";
const TODO_SETTINGS_NAME = "settings.json";
const TODO_ID_PREFIX = "TODO-";
const TODO_ID_PATTERN = /^[a-f0-9]{8}$/i;
const DEFAULT_TODO_SETTINGS = {
	gc: true,
	gcDays: 7,
};
const LOCK_TTL_MS = 30 * 60 * 1000;
const TODO_REMINDER_STATE_TYPE = "todo-reminder-state";
const TODO_REMINDER_MIN_TURNS = 5;
const TODO_REMINDER_COOLDOWN_TURNS = 5;
const TODO_VERIFICATION_MIN_COUNT = 3;
const VERIFICATION_KEYWORDS = /\b(verify|verification|test|tests|build|lint|typecheck|validate|smoke)\b/i;
const TODO_WIDGET_COMPLETED_AUTO_HIDE_MS = 5000;
const TODO_WIDGET_SHORTCUT_HINT_HIDE_MS = 30000;
const TODO_WIDGET_STATE_TYPE = "todo-widget-state";
const TODO_WIDGET_ID = "todo-widget";
const TODO_WIDGET_VISIBLE_ROWS = 6;
const TODO_RENDER_TREE_MAX_DEPTH = 4;
let autoHideTimer: ReturnType<typeof setTimeout> | null = null;
let shortcutHintHideTimer: ReturnType<typeof setTimeout> | null = null;

// === CONSTANTS ===

// Canonical: pending, in_progress, completed
// Legacy aliases (accepted on input, normalized on read): open, closed, done
const TODO_STATUSES = ["pending", "in_progress", "completed", "open", "closed", "done"] as const;
type TodoStatus = (typeof TODO_STATUSES)[number];

// === TYPES ===

const TODO_PRIORITIES = ["high", "medium", "low"] as const;
type TodoPriority = (typeof TODO_PRIORITIES)[number];

interface TodoFrontMatter {
	id: string;
	title: string;
	tags: string[];
	status: string;
	priority?: TodoPriority;
	created_at: string;
	assigned_to_session?: string;
	blocks?: string[];
	blocked_by?: string[];
	activeForm?: string;
}

interface TodoRecord extends TodoFrontMatter {
	body: string;
}

// === STORAGE ===

interface LockInfo {
	id: string;
	pid: number;
	session?: string | null;
	created_at: string;
}

interface TodoSettings {
	gc: boolean;
	gcDays: number;
}

interface TodoReminderState {
	trackedWork: boolean;
	turnsSinceTodo: number;
	turnsSinceReminder: number;
}

interface TodoWidgetState {
	todos: TodoFrontMatter[];
	currentSessionId?: string;
	hidden: boolean;
	showShortcutHint: boolean;
}

interface TodoWidgetPreferenceState {
	hidden: boolean;
}

interface TodoCreateInput {
	title: string;
	tags?: string[];
	status?: string;
	priority?: string;
	body?: string;
	blocks?: string[];
	blocked_by?: string[];
	activeForm?: string;
}

interface TodoBatchCreateItem extends TodoCreateInput {
	key?: string;
}

interface TodoStartOptions {
	force?: boolean;
	activeForm?: string;
	skipAutoStart?: boolean;
}

const TodoBatchCreateItemParams = Type.Object({
	key: Type.Optional(Type.String({ description: "Local key used for dependency references within the same create-many batch" })),
	title: Type.String({ description: "Short summary shown in lists" }),
	status: Type.Optional(Type.String({ description: "Todo status: pending, in_progress, completed, open, closed, done" })),
	priority: Type.Optional(Type.String({ description: "Priority: high, medium, or low" })),
	tags: Type.Optional(Type.Array(Type.String({ description: "Todo tag" }))),
	body: Type.Optional(Type.String({ description: "Long-form details (markdown)." })),
	blocks: Type.Optional(Type.Array(Type.String({ description: "Todo IDs or local keys that this item blocks" }))),
	blocked_by: Type.Optional(Type.Array(Type.String({ description: "Todo IDs or local keys that block this item" }))),
	activeForm: Type.Optional(Type.String({ description: "Present-continuous action label for in-progress display (e.g., 'Running tests')" })),
});

const TodoParams = Type.Object({
	action: StringEnum([
		"list",
		"list-all",
		"get",
		"create",
		"create-many",
		"update",
		"append",
		"delete",
		"claim",
		"release",
		"advance",
	] as const),
	id: Type.Optional(
		Type.String({ description: "Todo id (TODO-<hex> or raw hex filename)" }),
	),
	title: Type.Optional(Type.String({ description: "Short summary shown in lists" })),
	status: Type.Optional(Type.String({ description: "Todo status: pending, in_progress, completed, open, closed, done" })),
	priority: Type.Optional(Type.String({ description: "Priority: high, medium, or low" })),
	tags: Type.Optional(Type.Array(Type.String({ description: "Todo tag" }))),
	body: Type.Optional(
		Type.String({ description: "Long-form details (markdown). Update replaces; append adds." }),
	),
	append_body: Type.Optional(
		Type.String({ description: "Text to append to the body (used with update or advance to add notes without replacing existing body)" }),
	),
	force: Type.Optional(Type.Boolean({ description: "Override another session's assignment" })),
	blocks: Type.Optional(Type.Array(Type.String({ description: "Todo IDs that cannot start until this one completes" }))),
	blocked_by: Type.Optional(Type.Array(Type.String({ description: "Todo IDs that must complete before this one can start" }))),
	activeForm: Type.Optional(Type.String({ description: "Present-continuous action label for in-progress display (e.g., 'Running tests')" })),
	start: Type.Optional(Type.Boolean({ description: "For create: create and immediately assign+start the todo in one call" })),
	start_key: Type.Optional(Type.String({ description: "For create-many: local batch key of the item to assign and start immediately" })),
	next_id: Type.Optional(Type.String({ description: "For advance: the next todo to claim and start after completing the current one" })),
	items: Type.Optional(
		Type.Array(TodoBatchCreateItemParams, {
			description:
				"For create-many: array of new todo definitions. Each item may include a local key so blocks/blocked_by can reference other items in the same batch.",
		}),
	),
});

type TodoAction =
	| "list"
	| "list-all"
	| "get"
	| "create"
	| "create-many"
	| "update"
	| "append"
	| "delete"
	| "claim"
	| "release"
	| "advance";

type TodoToolDetails =
	| { action: "list" | "list-all"; todos: TodoFrontMatter[]; currentSessionId?: string; error?: string }
	| { action: "create-many"; todos: TodoRecord[]; keyMap?: Record<string, string>; error?: string }
	| {
			action: "get" | "create" | "update" | "append" | "delete" | "claim" | "release";
			todo: TodoRecord;
			currentSessionId?: string;
			error?: string;
		}
	| {
			action: "advance";
			completed?: TodoRecord;
			next?: TodoRecord;
			error?: string;
		};

function formatTodoId(id: string): string {
	return `${TODO_ID_PREFIX}${id}`;
}

function normalizeTodoId(id: string): string {
	let trimmed = id.trim();
	if (trimmed.startsWith("#")) {
		trimmed = trimmed.slice(1);
	}
	if (trimmed.toUpperCase().startsWith(TODO_ID_PREFIX)) {
		trimmed = trimmed.slice(TODO_ID_PREFIX.length);
	}
	return trimmed;
}

// === HELPERS ===

function validateTodoId(id: string): { id: string } | { error: string } {
	const normalized = normalizeTodoId(id);
	if (!normalized || !TODO_ID_PATTERN.test(normalized)) {
		return { error: "Invalid todo id. Expected TODO-<hex>." };
	}
	return { id: normalized.toLowerCase() };
}

function displayTodoId(id: string): string {
	return formatTodoId(normalizeTodoId(id));
}

function validateCreateStartState(
	actionLabel: string,
	status: string | undefined,
	startRequested: boolean,
	startHint = "start",
): { error?: string } {
	const normalizedStatus = normalizeStatus(status ?? "pending");
	if (startRequested) {
		if (normalizedStatus === "completed") {
			return { error: `${actionLabel} cannot start a completed todo.` };
		}
		return {};
	}
	if (normalizedStatus === "in_progress") {
		return { error: `${actionLabel} cannot create an unassigned in_progress todo. Use ${startHint} to assign it immediately.` };
	}
	return {};
}

function applyStartToTodo(
	todo: TodoRecord,
	sessionId: string,
	displayId: string,
	opts?: TodoStartOptions,
): { dirty: boolean } | { error: string } {
	if (isTodoClosed(todo.status)) {
		return { error: `Todo ${displayId} is closed` };
	}
	const assigned = todo.assigned_to_session;
	if (assigned && assigned !== sessionId && !opts?.force) {
		return {
			error: `Todo ${displayId} is already assigned to session ${assigned}. Use force to override.`,
		};
	}

	let dirty = false;
	if (assigned !== sessionId) {
		todo.assigned_to_session = sessionId;
		dirty = true;
	}
	if (!opts?.skipAutoStart && normalizeStatus(todo.status) === "pending") {
		todo.status = "in_progress";
		dirty = true;
	}
	if (opts?.activeForm !== undefined) {
		const nextActiveForm = opts.activeForm || undefined;
		if (todo.activeForm !== nextActiveForm) {
			todo.activeForm = nextActiveForm;
			dirty = true;
		}
	}

	normalizeLifecycleFields(todo);
	return { dirty };
}

function normalizeStatus(status: string): string {
	const s = status.trim().toLowerCase();
	if (s === "open") return "pending";
	if (s === "closed" || s === "done") return "completed";
	if (s !== "pending" && s !== "in_progress" && s !== "completed") {
		logTodoWarning(`Unknown status "${status}" - using as-is. Consider using pending/in_progress/completed.`);
	}
	return s;
}

function isTodoClosed(status: string): boolean {
	return normalizeStatus(status) === "completed";
}

function validateTodoStatus(status: unknown): { status: TodoStatus } | { error: string } {
	if (typeof status !== "string") {
		return { error: "Todo status must be a string." };
	}

	const normalized = normalizeStatus(status.trim().toLowerCase());
	if ((TODO_STATUSES as readonly string[]).includes(normalized)) {
		return { status: normalized as TodoStatus };
	}

	return {
		error: `Invalid todo status "${status}". Expected one of: ${TODO_STATUSES.join(", ")}.`,
	};
}

function normalizeLifecycleFields(todo: TodoFrontMatter): void {
	const status = normalizeStatus(getTodoStatus(todo));
	if (status !== "in_progress") {
		todo.activeForm = undefined;
	}
	if (isTodoClosed(status)) {
		todo.assigned_to_session = undefined;
	}
}

function validateBatchKey(key: string, seenKeys: Set<string>): { key: string } | { error: string } {
	const normalized = key.trim();
	if (!normalized) {
		return { error: "Batch item key must be a non-empty string." };
	}
	if (!("error" in validateTodoId(normalized))) {
		return { error: `Batch item key "${normalized}" cannot look like a todo id. Use a simple local label instead.` };
	}
	if (seenKeys.has(normalized)) {
		return { error: `Duplicate batch item key "${normalized}".` };
	}
	return { key: normalized };
}

function resolveBatchDependencyIds(
	refs: string[] | undefined,
	keyToId: Map<string, string>,
	fieldName: "blocks" | "blocked_by",
	itemIndex: number,
): { ids?: string[] } | { error: string } {
	if (!refs?.length) {
		return { ids: undefined };
	}

	const resolved: string[] = [];
	for (const ref of refs) {
		const trimmed = ref.trim();
		if (!trimmed) {
			return { error: `Batch item ${itemIndex + 1} has an empty ${fieldName} reference.` };
		}
		const localId = keyToId.get(trimmed);
		if (localId) {
			resolved.push(localId);
			continue;
		}
		const validated = validateTodoId(trimmed);
		if ("error" in validated) {
			return {
				error:
					`Invalid ${fieldName} reference "${ref}" in batch item ${itemIndex + 1}. Use TODO-<hex>, raw hex, or a local batch key.`,
			};
		}
		resolved.push(validated.id);
	}

	return { ids: [...new Set(resolved)] };
}

function buildTodoRecord(id: string, input: TodoCreateInput): TodoRecord | { error: string } {
	const statusResult = validateTodoStatus(input.status ?? "pending");
	if ("error" in statusResult) {
		return statusResult;
	}

	const todo: TodoRecord = {
		id,
		title: input.title,
		tags: input.tags ?? [],
		status: statusResult.status,
		priority: TODO_PRIORITIES.includes(input.priority as TodoPriority) ? (input.priority as TodoPriority) : undefined,
		created_at: new Date().toISOString(),
		blocks: input.blocks?.map((blockerId) => normalizeTodoId(blockerId)) ?? undefined,
		blocked_by: input.blocked_by?.map((blockerId) => normalizeTodoId(blockerId)) ?? undefined,
		activeForm: input.activeForm || undefined,
		body: input.body ?? "",
	};
	normalizeLifecycleFields(todo);
	return todo;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function getPriorityRank(priority?: string): number {
	return priority && priority in PRIORITY_ORDER ? PRIORITY_ORDER[priority] : 1;
}

function isBlocked(todo: TodoFrontMatter): boolean {
	return Boolean(todo.blocked_by?.length);
}

function isActiveStatus(todo: TodoFrontMatter): boolean {
	return ["in_progress", "in-progress", "review", "active", "doing"].includes(getTodoStatus(todo).toLowerCase());
}

function getTodoStatusGlyph(theme: Theme, todo: TodoFrontMatter): string {
	const status = getTodoStatus(todo);
	if (isTodoClosed(status)) return theme.fg("success", "✔");
	if (isActiveStatus(todo)) return theme.fg("accent", "●");
	if (isBlocked(todo)) return theme.fg("warning", "▸");
	return theme.fg("dim", "○");
}

function sortTodos(todos: TodoFrontMatter[]): TodoFrontMatter[] {
	return [...todos].sort((a, b) => {
		const aClosed = isTodoClosed(a.status);
		const bClosed = isTodoClosed(b.status);
		if (aClosed !== bClosed) return aClosed ? 1 : -1;
		const aAssigned = !aClosed && Boolean(a.assigned_to_session);
		const bAssigned = !bClosed && Boolean(b.assigned_to_session);
		if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
		// Blocked todos sort after unblocked
		const aBlocked = isBlocked(a);
		const bBlocked = isBlocked(b);
		if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;
		// Higher priority sorts first
		const aPri = getPriorityRank(a.priority);
		const bPri = getPriorityRank(b.priority);
		if (aPri !== bPri) return aPri - bPri;
		return (a.created_at || "").localeCompare(b.created_at || "");
	});
}

// === DIRECTORY/SETTINGS ===

function getTodosDir(cwd: string): string {
	const overridePath = process.env[TODO_PATH_ENV];
	if (overridePath && overridePath.trim()) {
		return path.resolve(cwd, overridePath.trim());
	}
	return path.resolve(cwd, TODO_DIR_NAME);
}

function getTodosDirLabel(cwd: string): string {
	const overridePath = process.env[TODO_PATH_ENV];
	if (overridePath && overridePath.trim()) {
		return path.resolve(cwd, overridePath.trim());
	}
	return TODO_DIR_NAME;
}

function getTodoSettingsPath(todosDir: string): string {
	return path.join(todosDir, TODO_SETTINGS_NAME);
}

function normalizeTodoSettings(raw: Partial<TodoSettings>): TodoSettings {
	const gc = raw.gc ?? DEFAULT_TODO_SETTINGS.gc;
	const gcDays = Number.isFinite(raw.gcDays) ? raw.gcDays : DEFAULT_TODO_SETTINGS.gcDays;
	return {
		gc: Boolean(gc),
		gcDays: Math.max(0, Math.floor(gcDays)),
	};
}

async function readTodoSettings(todosDir: string): Promise<TodoSettings> {
	const settingsPath = getTodoSettingsPath(todosDir);
	let data: Partial<TodoSettings> = {};

	try {
		const raw = await fs.readFile(settingsPath, "utf8");
		data = JSON.parse(raw) as Partial<TodoSettings>;
	} catch (error) {
		if (getErrorCode(error) !== "ENOENT") {
			logTodoWarning(`Failed to read settings from ${settingsPath}; using defaults`, error);
		}
		data = {};
	}

	return normalizeTodoSettings(data);
}

// === GARBAGE COLLECTION ===

async function garbageCollectTodos(todosDir: string, settings: TodoSettings): Promise<void> {
	if (!settings.gc) return;

	let entries: string[] = [];
	try {
		entries = await fs.readdir(todosDir);
	} catch (error) {
		if (getErrorCode(error) !== "ENOENT") {
			logTodoWarning(`Failed to read todos directory ${todosDir} during garbage collection`, error);
		}
		return;
	}

	const cutoff = Date.now() - settings.gcDays * 24 * 60 * 60 * 1000;
	await Promise.all(
		entries
			.filter((entry) => entry.endsWith(".md"))
			.map(async (entry) => {
				const id = entry.slice(0, -3);
				const filePath = path.join(todosDir, entry);
				try {
					const content = await fs.readFile(filePath, "utf8");
					const { frontMatter } = splitFrontMatter(content);
					const parsed = parseFrontMatter(frontMatter, id, filePath);
					if (parsed.error) {
						logTodoWarning(`Skipping garbage collection for malformed todo ${filePath}`, parsed.error);
						return;
					}
					if (normalizeTodoId(parsed.data.id).toLowerCase() !== normalizeTodoId(id).toLowerCase()) {
						logTodoWarning(`Skipping garbage collection for todo id mismatch in ${filePath}`);
						return;
					}
					if (!isTodoClosed(parsed.data.status)) return;
					// Use file mtime as a proxy for when the todo was closed (updated on
					// every write), rather than created_at, so recently-closed old todos
					// are not immediately garbage-collected on the next startup.
					const stats = await fs.stat(filePath).catch((statErr) => {
						if (getErrorCode(statErr) !== "ENOENT") {
							logTodoWarning(`Failed to stat todo ${filePath} during GC`, statErr);
						}
						return null;
					});
					if (!stats || stats.mtimeMs >= cutoff) return;
					// Only delete if no lock is held — avoids racing with active sessions
					const lockPath = getLockPath(todosDir, id);
					try {
						const lockHandle = await fs.open(lockPath, "wx");
						await lockHandle.close();
						try {
							const refreshedContent = await fs.readFile(filePath, "utf8").catch((readErr) => {
								if (getErrorCode(readErr) !== "ENOENT") {
									logTodoWarning(`Failed to re-read todo ${filePath} during GC`, readErr);
								}
								return null;
							});
							if (!refreshedContent) return;
							const { frontMatter: refreshedFrontMatter } = splitFrontMatter(refreshedContent);
							const refreshedParsed = parseFrontMatter(refreshedFrontMatter, id, filePath);
							if (refreshedParsed.error) {
								logTodoWarning(`Skipping garbage collection for malformed todo ${filePath} after GC lock`, refreshedParsed.error);
								return;
							}
							if (!isTodoClosed(refreshedParsed.data.status)) return;
							const refreshedStats = await fs.stat(filePath).catch((statErr) => {
								if (getErrorCode(statErr) !== "ENOENT") {
									logTodoWarning(`Failed to restat todo ${filePath} during GC`, statErr);
								}
								return null;
							});
							if (!refreshedStats || refreshedStats.mtimeMs >= cutoff) return;
							await fs.unlink(filePath);
						} finally {
							await fs.unlink(lockPath).catch((error) => {
								if (getErrorCode(error) !== "ENOENT") {
									logTodoWarning(`Failed to remove GC lock ${lockPath}`, error);
								}
							});
						}
					} catch (lockErr) {
						if (getErrorCode(lockErr) === "EEXIST") {
							// Lock held by another session — skip this todo
							return;
						}
						logTodoWarning(`GC lock check failed for ${filePath}`, lockErr);
					}
					} catch (error) {
					logTodoWarning(`Failed to garbage-collect todo ${filePath}`, error);
				}
			}),
	);
}

function getTodoPath(todosDir: string, id: string): string {
	return path.join(todosDir, `${id}.md`);
}

function getLockPath(todosDir: string, id: string): string {
	return path.join(todosDir, `${id}.lock`);
}

interface ParsedTodoFrontMatter {
	data: TodoFrontMatter;
	error?: string;
}

function parseFrontMatter(
	text: string,
	idFallback: string,
	sourceLabel?: string,
): ParsedTodoFrontMatter {
	const data: TodoFrontMatter = {
		id: idFallback,
		title: "",
		tags: [],
		status: "open",
		created_at: "",
		assigned_to_session: undefined,
	};

	const trimmed = text.trim();
	if (!trimmed) return { data };

	try {
		const parsed = JSON.parse(trimmed) as Partial<TodoFrontMatter> | null;
		if (!parsed || typeof parsed !== "object") {
			return {
				data,
				error: `Invalid todo front matter${sourceLabel ? ` in ${sourceLabel}` : ""}: expected a JSON object`,
			};
		}
		if (typeof parsed.id === "string" && parsed.id) data.id = parsed.id;
		if (typeof parsed.title === "string") data.title = parsed.title;
		if (typeof parsed.status === "string" && parsed.status) data.status = normalizeStatus(parsed.status);
		if (typeof parsed.created_at === "string") data.created_at = parsed.created_at;
		if (typeof parsed.assigned_to_session === "string" && parsed.assigned_to_session.trim()) {
			data.assigned_to_session = parsed.assigned_to_session;
		}
		if (Array.isArray(parsed.tags)) {
			data.tags = parsed.tags.filter((tag): tag is string => typeof tag === "string");
		}
		if (typeof parsed.priority === "string" && TODO_PRIORITIES.includes(parsed.priority as TodoPriority)) {
			data.priority = parsed.priority as TodoPriority;
		}
		if (Array.isArray(parsed.blocks)) {
			data.blocks = parsed.blocks
				.filter((id): id is string => typeof id === "string")
				.map(normalizeTodoId);
		}
		if (Array.isArray(parsed.blocked_by)) {
			data.blocked_by = parsed.blocked_by
				.filter((id): id is string => typeof id === "string")
				.map(normalizeTodoId);
		}
		if (typeof parsed.activeForm === "string" && parsed.activeForm.trim()) {
			data.activeForm = parsed.activeForm.trim();
		}
	} catch (error) {
		return {
			data,
			error: `Invalid todo front matter${sourceLabel ? ` in ${sourceLabel}` : ""}: ${getErrorMessage(error)}`,
		};
	}

	return { data };
}

function findJsonObjectEnd(content: string): number {
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let i = 0; i < content.length; i += 1) {
		const char = content[i];

		if (inString) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === "\\") {
				escaped = true;
				continue;
			}
			if (char === "\"") {
				inString = false;
			}
			continue;
		}

		if (char === "\"") {
			inString = true;
			continue;
		}

		if (char === "{") {
			depth += 1;
			continue;
		}

		if (char === "}") {
			depth -= 1;
			if (depth === 0) return i;
		}
	}

	return -1;
}

function splitFrontMatter(content: string): { frontMatter: string; body: string } {
	if (!content.startsWith("{")) {
		throw new Error("Malformed todo file: expected JSON front matter at the start of the file");
	}

	const endIndex = findJsonObjectEnd(content);
	if (endIndex === -1) {
		throw new Error("Malformed todo front matter: missing closing brace");
	}

	const frontMatter = content.slice(0, endIndex + 1);
	const body = content.slice(endIndex + 1).replace(/^\r?\n+/, "").replace(/\s+$/, "");
	return { frontMatter, body };
}

function parseTodoContent(
	content: string,
	idFallback: string,
	sourceLabel?: string,
): TodoRecord {
	const { frontMatter, body } = splitFrontMatter(content);
	const parsed = parseFrontMatter(frontMatter, idFallback, sourceLabel);
	if (parsed.error) {
		throw new Error(parsed.error);
	}
	const expectedId = normalizeTodoId(idFallback).toLowerCase();
	const parsedId = normalizeTodoId(parsed.data.id).toLowerCase();
	if (parsedId !== expectedId) {
		throw new Error(
			`Todo id mismatch: file declares ${formatTodoId(parsedId)} but filename is ${formatTodoId(expectedId)}`,
		);
	}
	return {
		id: parsedId,
		title: parsed.data.title,
		tags: parsed.data.tags ?? [],
		status: parsed.data.status,
		priority: parsed.data.priority,
		created_at: parsed.data.created_at,
		assigned_to_session: parsed.data.assigned_to_session,
		blocks: parsed.data.blocks,
		blocked_by: parsed.data.blocked_by,
		activeForm: parsed.data.activeForm,
		body: body ?? "",
	};
}

function serializeTodo(todo: TodoRecord): string {
	const frontMatter = JSON.stringify(
		{
			id: todo.id,
			title: todo.title,
			tags: todo.tags ?? [],
			status: todo.status,
			created_at: todo.created_at,
			assigned_to_session: todo.assigned_to_session || undefined,
			priority: todo.priority || undefined,
			blocks: todo.blocks?.length ? todo.blocks : undefined,
			blocked_by: todo.blocked_by?.length ? todo.blocked_by : undefined,
			activeForm: todo.activeForm || undefined,
		},
		null,
		2,
	);

	const body = todo.body ?? "";
	const trimmedBody = body.replace(/^\n+/, "").replace(/\s+$/, "");
	if (!trimmedBody) return `${frontMatter}\n`;
	return `${frontMatter}\n\n${trimmedBody}\n`;
}

async function ensureTodosDir(todosDir: string) {
	await fs.mkdir(todosDir, { recursive: true });
}

async function readTodoFile(filePath: string, idFallback: string): Promise<TodoRecord> {
	const content = await fs.readFile(filePath, "utf8");
	return parseTodoContent(content, idFallback, filePath);
}

async function writeTodoFile(filePath: string, todo: TodoRecord) {
	await fs.writeFile(filePath, serializeTodo(todo), "utf8");
}

// === LOCKING ===

async function generateTodoId(todosDir: string, reservedIds: Set<string> = new Set()): Promise<string> {
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const id = crypto.randomBytes(4).toString("hex");
		if (reservedIds.has(id)) {
			continue;
		}
		const todoPath = getTodoPath(todosDir, id);
		if (!existsSync(todoPath)) {
			reservedIds.add(id);
			return id;
		}
	}
	throw new Error("Failed to generate unique todo id");
}

async function readLockInfo(lockPath: string): Promise<LockInfo | null> {
	try {
		const raw = await fs.readFile(lockPath, "utf8");
		return JSON.parse(raw) as LockInfo;
	} catch (error) {
		if (getErrorCode(error) !== "ENOENT") {
			logTodoWarning(`Failed to read lock info from ${lockPath}`, error);
		}
		return null;
	}
}

async function acquireLock(
	todosDir: string,
	id: string,
	ctx: ExtensionContext,
): Promise<(() => Promise<void>) | { error: string }> {
	const lockPath = getLockPath(todosDir, id);
	const now = Date.now();
	const session = ctx.sessionManager.getSessionFile();

	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const handle = await fs.open(lockPath, "wx");
			try {
				const info: LockInfo = {
					id,
					pid: process.pid,
					session,
					created_at: new Date(now).toISOString(),
				};
				await handle.writeFile(JSON.stringify(info, null, 2), "utf8");
				await handle.close();
				} catch (writeErr) {
					await handle.close().catch((error) => {
						logTodoWarning(`Failed to close lock handle for ${lockPath} after write error`, error);
					});
					await fs.unlink(lockPath).catch((error) => {
						if (getErrorCode(error) !== "ENOENT") {
							logTodoWarning(`Failed to remove lock file ${lockPath} after write error`, error);
						}
					});
					return { error: `Failed to write lock file: ${getErrorMessage(writeErr)}` };
				}
			return async () => {
				try {
					await fs.unlink(lockPath);
				} catch (error) {
					if (getErrorCode(error) !== "ENOENT") {
						logTodoWarning(`Failed to release lock ${lockPath}`, error);
					}
				}
			};
		} catch (error: unknown) {
			const code = getErrorCode(error);
			if (code !== "EEXIST") {
				return { error: `Failed to acquire lock: ${getErrorMessage(error)}` };
			}
				const stats = await fs.stat(lockPath).catch((error) => {
					if (getErrorCode(error) !== "ENOENT") {
						logTodoWarning(`Failed to stat lock file ${lockPath}`, error);
					}
					return null;
				});
			const lockAge = stats ? now - stats.mtimeMs : LOCK_TTL_MS + 1;
			if (lockAge <= LOCK_TTL_MS) {
				const info = await readLockInfo(lockPath);
				const owner = info?.session ? ` (session ${info.session})` : "";
				return { error: `Todo ${displayTodoId(id)} is locked${owner}. Try again later.` };
			}
			if (!ctx.hasUI) {
				return { error: `Todo ${displayTodoId(id)} lock is stale; rerun in interactive mode to steal it.` };
			}
			const ok = await ctx.ui.confirm(
				"Todo locked",
				`Todo ${displayTodoId(id)} appears locked. Steal the lock?`,
			);
			if (!ok) {
				return { error: `Todo ${displayTodoId(id)} remains locked.` };
			}
			const unlinkErr = await fs.unlink(lockPath).then(() => null).catch((error) => {
				if (getErrorCode(error) === "ENOENT") return null;
				return error as Error;
			});
			if (unlinkErr) {
				logTodoWarning(`Failed to remove stale lock ${lockPath}`, unlinkErr);
				return { error: `Failed to steal lock for todo ${displayTodoId(id)}: ${getErrorMessage(unlinkErr)}` };
			}
		}
	}

	return { error: `Failed to acquire lock for todo ${displayTodoId(id)}.` };
}

// === LIST/QUERY ===

async function withTodoLock<T>(
	todosDir: string,
	id: string,
	ctx: ExtensionContext,
	fn: () => Promise<T>,
): Promise<T | { error: string }> {
	const lock = await acquireLock(todosDir, id, ctx);
	if (typeof lock === "object" && "error" in lock) return lock;
	try {
		return await fn();
	} catch (error) {
		return { error: `Todo ${displayTodoId(id)} operation failed: ${getErrorMessage(error)}` };
	} finally {
		await lock();
	}
}

interface ListTodosResult {
	todos: TodoFrontMatter[];
	error?: string;
}

async function listTodos(todosDir: string): Promise<ListTodosResult> {
	let entries: string[] = [];
	try {
		entries = await fs.readdir(todosDir);
	} catch (error) {
		if (getErrorCode(error) === "ENOENT") {
			return { todos: [] };
		}
		logTodoWarning(`Failed to read todos directory ${todosDir}`, error);
		return { todos: [], error: getErrorMessage(error) };
	}

	const todos: TodoFrontMatter[] = [];
	let skipped = 0;
	for (const entry of entries) {
		if (!entry.endsWith(".md")) continue;
		const id = entry.slice(0, -3);
		const filePath = path.join(todosDir, entry);
		try {
			const content = await fs.readFile(filePath, "utf8");
			const { frontMatter } = splitFrontMatter(content);
			const parsed = parseFrontMatter(frontMatter, id, filePath);
			if (parsed.error) {
				throw new Error(parsed.error);
			}
			if (normalizeTodoId(parsed.data.id).toLowerCase() !== normalizeTodoId(id).toLowerCase()) {
				throw new Error(
					`Todo id mismatch: file declares ${formatTodoId(parsed.data.id)} but filename is ${formatTodoId(id)}`,
				);
			}
			todos.push({
				id,
				title: parsed.data.title,
				tags: parsed.data.tags ?? [],
				status: parsed.data.status,
				priority: parsed.data.priority,
				created_at: parsed.data.created_at,
				assigned_to_session: parsed.data.assigned_to_session,
				blocks: parsed.data.blocks,
				blocked_by: parsed.data.blocked_by,
				activeForm: parsed.data.activeForm,
			});
		} catch (error) {
			logTodoWarning(`Failed to read todo ${filePath}`, error);
			skipped += 1;
		}
	}

	return {
		todos: sortTodos(todos),
		error: skipped > 0 ? `${skipped} todo file${skipped === 1 ? "" : "s"} could not be read or parsed.` : undefined,
	};
}

function listTodosSync(todosDir: string): ListTodosResult {
	let entries: string[] = [];
	try {
		entries = readdirSync(todosDir);
	} catch (error) {
		if (getErrorCode(error) === "ENOENT") {
			return { todos: [] };
		}
		logTodoWarning(`Failed to synchronously read todos directory ${todosDir}`, error);
		return { todos: [], error: getErrorMessage(error) };
	}

	const todos: TodoFrontMatter[] = [];
	let skipped = 0;
	for (const entry of entries) {
		if (!entry.endsWith(".md")) continue;
		const id = entry.slice(0, -3);
		const filePath = path.join(todosDir, entry);
		try {
			const content = readFileSync(filePath, "utf8");
			const { frontMatter } = splitFrontMatter(content);
			const parsed = parseFrontMatter(frontMatter, id, filePath);
			if (parsed.error) {
				throw new Error(parsed.error);
			}
			if (normalizeTodoId(parsed.data.id).toLowerCase() !== normalizeTodoId(id).toLowerCase()) {
				throw new Error(
					`Todo id mismatch: file declares ${formatTodoId(parsed.data.id)} but filename is ${formatTodoId(id)}`,
				);
			}
			todos.push({
				id,
				title: parsed.data.title,
				tags: parsed.data.tags ?? [],
				status: parsed.data.status,
				priority: parsed.data.priority,
				created_at: parsed.data.created_at,
				assigned_to_session: parsed.data.assigned_to_session,
				blocks: parsed.data.blocks,
				blocked_by: parsed.data.blocked_by,
				activeForm: parsed.data.activeForm,
			});
		} catch (error) {
			logTodoWarning(`Failed to synchronously read todo ${filePath}`, error);
			skipped += 1;
		}
	}

	return {
		todos: sortTodos(todos),
		error: skipped > 0 ? `${skipped} todo file${skipped === 1 ? "" : "s"} could not be read or parsed.` : undefined,
	};
}

function getTodoTitle(todo: TodoFrontMatter): string {
	return todo.title || "(untitled)";
}

function getTodoStatus(todo: TodoFrontMatter): string {
	return todo.status || "pending";
}

function splitTodosByAssignment(todos: TodoFrontMatter[]): {
	assignedTodos: TodoFrontMatter[];
	openTodos: TodoFrontMatter[];
	closedTodos: TodoFrontMatter[];
} {
	const assignedTodos: TodoFrontMatter[] = [];
	const openTodos: TodoFrontMatter[] = [];
	const closedTodos: TodoFrontMatter[] = [];
	for (const todo of todos) {
		if (isTodoClosed(getTodoStatus(todo))) {
			closedTodos.push(todo);
			continue;
		}
		if (todo.assigned_to_session) {
			assignedTodos.push(todo);
		} else {
			openTodos.push(todo);
		}
	}
	return { assignedTodos, openTodos, closedTodos };
}

function filterVisibleTodosForSession(
	todos: TodoFrontMatter[],
	currentSessionId?: string,
): TodoFrontMatter[] {
	return todos.filter((todo) => !todo.assigned_to_session || todo.assigned_to_session === currentSessionId);
}

function serializeTodoForAgent(todo: TodoRecord): string {
	const payload = { ...todo, id: formatTodoId(todo.id) };
	return JSON.stringify(payload, null, 2);
}

function serializeTodoCreateManyForAgent(todos: TodoRecord[], keyMap: Record<string, string>): string {
	const formattedKeyMap = Object.fromEntries(
		Object.entries(keyMap).map(([key, id]) => [key, formatTodoId(id)]),
	);
	return JSON.stringify(
		{
			created: todos.map((todo) => ({ ...todo, id: formatTodoId(todo.id) })),
			key_map: Object.keys(formattedKeyMap).length ? formattedKeyMap : undefined,
		},
		null,
		2,
	);
}

// Filter out completed blocker IDs from blocked_by arrays for display and model-facing output
function filterResolvedBlockers(todos: TodoFrontMatter[]): TodoFrontMatter[] {
	const completedIds = new Set(todos.filter((t) => isTodoClosed(getTodoStatus(t))).map((t) => t.id));
	return todos.map((todo) => {
		if (!todo.blocked_by?.length) return todo;
		const filtered = todo.blocked_by.filter((id) => !completedIds.has(id));
		if (filtered.length === todo.blocked_by.length) return todo;
		return { ...todo, blocked_by: filtered.length ? filtered : undefined };
	});
}

function buildDisplayTodoTree(todos: TodoFrontMatter[]): {
	displayTodos: TodoFrontMatter[];
	rootTodos: TodoFrontMatter[];
	childrenOf: Map<string, TodoFrontMatter[]>;
} {
	const displayTodos = sortTodos(filterResolvedBlockers(todos));
	const displayTodoIds = new Set(displayTodos.map((todo) => todo.id));
	const sortIndexById = new Map(displayTodos.map((todo, index) => [todo.id, index]));
	const chosenParentOf = new Map<string, string>();
	const childrenOf = new Map<string, TodoFrontMatter[]>();

	for (const todo of displayTodos) {
		let chosenParentId: string | undefined;
		let chosenParentIndex = Number.POSITIVE_INFINITY;
		for (const parentId of todo.blocked_by ?? []) {
			if (!displayTodoIds.has(parentId)) continue;
			const parentIndex = sortIndexById.get(parentId);
			if (parentIndex === undefined || parentIndex >= chosenParentIndex) continue;
			chosenParentId = parentId;
			chosenParentIndex = parentIndex;
		}
		if (!chosenParentId) continue;
		chosenParentOf.set(todo.id, chosenParentId);
		const children = childrenOf.get(chosenParentId) ?? [];
		children.push(todo);
		childrenOf.set(chosenParentId, children);
	}

	return {
		displayTodos,
		rootTodos: displayTodos.filter((todo) => !chosenParentOf.has(todo.id)),
		childrenOf,
	};
}

function serializeTodoListForAgent(todos: TodoFrontMatter[]): string {
	const filteredTodos = filterResolvedBlockers(todos);
	const { assignedTodos, openTodos, closedTodos } = splitTodosByAssignment(filteredTodos);
	const mapTodo = (todo: TodoFrontMatter) => ({ ...todo, id: formatTodoId(todo.id) });
	return JSON.stringify(
		{
			assigned: assignedTodos.map(mapTodo),
			open: openTodos.map(mapTodo),
			closed: closedTodos.map(mapTodo),
		},
		null,
		2,
	);
}

function getPriorityTitleColor(todo: TodoFrontMatter): string {
	if (isTodoClosed(getTodoStatus(todo))) return "dim";
	if (isBlocked(todo)) return "muted";
	if (todo.priority === "high") return "error";
	if (todo.priority === "medium") return "warning";
	return "text";
}

// === RENDERING ===

function renderTodoHeading(
	theme: Theme,
	todo: TodoFrontMatter,
	currentSessionId?: string,
	showCurrentSessionMarker = false,
): string {
	const glyph = getTodoStatusGlyph(theme, todo);
	const titleColor = getPriorityTitleColor(todo);
	const tagText = todo.tags.length ? theme.fg("dim", ` [${todo.tags.join(", ")}]`) : "";
	const currentSessionText =
		showCurrentSessionMarker &&
		Boolean(currentSessionId) &&
		todo.assigned_to_session === currentSessionId
			? theme.fg("dim", " ·you")
			: "";
	return glyph + " " + theme.fg(titleColor, getTodoTitle(todo)) + tagText + currentSessionText;
}

function renderTodoStateSummary(
	theme: Theme,
	todo: TodoFrontMatter,
	currentSessionId?: string,
): string {
	const titleColor = getPriorityTitleColor(todo);
	const title = theme.fg(titleColor, getTodoTitle(todo));
	const currentSessionText =
		currentSessionId && todo.assigned_to_session === currentSessionId
			? theme.fg("dim", " ·you")
			: "";

	if (isTodoClosed(getTodoStatus(todo))) {
		return theme.fg("success", "✓ ") + theme.fg("muted", "Completed ") + title + currentSessionText;
	}
	if (isActiveStatus(todo)) {
		return theme.fg("accent", "◼ ") + theme.fg("muted", "In progress ") + title + currentSessionText;
	}
	return theme.fg("dim", "◻ ") + theme.fg("muted", "Planned ") + title + currentSessionText;
}

function renderDeletedTodoSummary(theme: Theme, todo: TodoFrontMatter): string {
	return theme.fg("warning", "× ") + theme.fg("muted", "Removed ") + theme.fg(getPriorityTitleColor(todo), getTodoTitle(todo));
}

function renderTodoList(
	theme: Theme,
	todos: TodoFrontMatter[],
	expanded: boolean,
	currentSessionId?: string,
	showCurrentSessionMarker = false,
): string {
	if (!todos.length) return theme.fg("dim", "No todos");

	const { displayTodos, rootTodos, childrenOf } = buildDisplayTodoTree(todos);
	const allCompleted = displayTodos.every((todo) => isTodoClosed(getTodoStatus(todo)));
	if (!expanded && allCompleted) {
		return theme.fg("success", `✔ ${displayTodos.length}/${displayTodos.length} complete`);
	}

	const renderedIds = new Set<string>();
	const lines: string[] = [];
	const renderTreeNode = (todo: TodoFrontMatter, depth: number) => {
		if (renderedIds.has(todo.id)) return;
		renderedIds.add(todo.id);
		const cappedDepth = Math.min(depth, TODO_RENDER_TREE_MAX_DEPTH);
		const indent = cappedDepth === 0 ? "" : `${"  ".repeat(cappedDepth - 1)}${theme.fg("dim", "└")} `;
		lines.push(indent + renderTodoHeading(theme, todo, currentSessionId, showCurrentSessionMarker));
		for (const child of childrenOf.get(todo.id) ?? []) {
			renderTreeNode(child, depth + 1);
		}
	};

	const visibleRoots = expanded
		? rootTodos
		: rootTodos.filter((todo) => !isTodoClosed(getTodoStatus(todo)));
	for (const rootTodo of visibleRoots) {
		renderTreeNode(rootTodo, 0);
	}
	// Fallback for cycles or malformed blocker graphs that leave items unreachable from a visible root.
	for (const todo of displayTodos) {
		if (renderedIds.has(todo.id)) continue;
		if (!expanded && isTodoClosed(getTodoStatus(todo))) continue;
		renderTreeNode(todo, 0);
	}

	return lines.length ? lines.join("\n") : theme.fg("dim", "No todos");
}

function renderTodoDetail(
	theme: Theme,
	todo: TodoRecord,
	expanded: boolean,
	currentSessionId?: string,
): string {
	const summary = renderTodoHeading(theme, todo);
	if (!expanded) return summary;

	const bodyText = todo.body?.trim() ? todo.body.trim() : "No details yet.";
	const bodyLines = bodyText.split("\n");

	// Compact metadata line: status · priority · tags · created
	const metaParts: string[] = [];
	const status = getTodoStatus(todo);
	const statusColor = isTodoClosed(status) ? "dim" : isActiveStatus(todo) ? "accent" : "muted";
	metaParts.push(theme.fg(statusColor, status));
	if (todo.priority) {
		const prioColor = todo.priority === "high" ? "error" : todo.priority === "medium" ? "warning" : "dim";
		metaParts.push(theme.fg(prioColor, `!${todo.priority}`));
	}
	if (todo.tags.length) metaParts.push(theme.fg("dim", todo.tags.join(", ")));
	if (todo.assigned_to_session && todo.assigned_to_session === currentSessionId) {
		metaParts.push(theme.fg("dim", "(you)"));
	}

	const createdAt = todo.created_at ? todo.created_at.slice(0, 10) : "unknown";
	metaParts.push(theme.fg("dim", createdAt));

	const lines = [
		summary,
		"  " + metaParts.join(theme.fg("muted", " · ")),
	];

	// Dependency lines (only if present)
	if (todo.blocked_by?.length) {
		lines.push("  " + theme.fg("warning", "blocked by ") + theme.fg("accent", todo.blocked_by.map(formatTodoId).join(", ")));
	}
	if (todo.blocks?.length) {
		lines.push("  " + theme.fg("muted", "blocks ") + theme.fg("accent", todo.blocks.map(formatTodoId).join(", ")));
	}

	lines.push("");
	lines.push(...bodyLines.map((line) => theme.fg("text", `  ${line}`)));

	return lines.join("\n");
}

function appendExpandHint(theme: Theme, text: string, inline = false): string {
	const hint = inline
		? theme.fg("dim", ` · ${keyHint("app.tools.expand", "to expand")}`)
		: `\n${theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`)}`;
	return `${text}${hint}`;
}

function getErrorCode(error: unknown): string | undefined {
	if (!error || typeof error !== "object" || !("code" in error)) return undefined;
	const code = (error as { code?: unknown }).code;
	return typeof code === "string" ? code : undefined;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return String(error);
}

// === REMINDER ===

function logTodoWarning(message: string, error?: unknown): void {
	if (error === undefined) {
		console.warn(`[todos] ${message}`);
		return;
	}
	console.warn(`[todos] ${message}: ${getErrorMessage(error)}`);
}

function getLatestCustomEntryData<T>(ctx: ExtensionContext, customType: string, branchOnly = false): T | undefined {
	const entries = branchOnly ? ctx.sessionManager.getBranch() : ctx.sessionManager.getEntries();
	let data: T | undefined;
	for (const entry of entries as Array<{ type: string; customType?: string; data?: unknown }>) {
		if (entry.type === "custom" && entry.customType === customType) {
			data = entry.data as T | undefined;
		}
	}
	return data;
}

function createDefaultTodoReminderState(): TodoReminderState {
	return {
		trackedWork: false,
		turnsSinceTodo: 0,
		turnsSinceReminder: TODO_REMINDER_COOLDOWN_TURNS,
	};
}

function normalizeTodoReminderState(raw: unknown): TodoReminderState {
	const fallback = createDefaultTodoReminderState();
	if (!raw || typeof raw !== "object") return fallback;
	const data = raw as Partial<TodoReminderState>;
	const turnsSinceTodo = Number.isFinite(data.turnsSinceTodo) ? Math.max(0, Math.floor(data.turnsSinceTodo as number)) : fallback.turnsSinceTodo;
	const turnsSinceReminder = Number.isFinite(data.turnsSinceReminder) ? Math.max(0, Math.floor(data.turnsSinceReminder as number)) : fallback.turnsSinceReminder;
	return {
		trackedWork: data.trackedWork === true,
		turnsSinceTodo,
		turnsSinceReminder,
	};
}

function createDefaultTodoWidgetState(): TodoWidgetState {
	return {
		todos: [],
		currentSessionId: undefined,
		hidden: false,
		showShortcutHint: false,
	};
}

function normalizeTodoWidgetPreferenceState(raw: unknown): TodoWidgetPreferenceState {
	if (!raw || typeof raw !== "object") {
		return { hidden: false };
	}
	return { hidden: (raw as { hidden?: unknown }).hidden === true };
}

function isTodoWidgetVisible(state: TodoWidgetState): boolean {
	return !state.hidden && state.todos.length > 0;
}

function getTodoWidgetCounts(todos: TodoFrontMatter[]): { total: number; inProgress: number } {
	let inProgress = 0;

	for (const todo of todos) {
		if (!isTodoClosed(getTodoStatus(todo)) && isActiveStatus(todo)) {
			inProgress += 1;
		}
	}

	return {
		total: todos.length,
		inProgress,
	};
}

function renderTodoWidgetSummary(
	theme: Theme,
	todos: TodoFrontMatter[],
	width: number,
): string {
	const counts = getTodoWidgetCounts(todos);
	const noun = counts.total === 1 ? "task" : "tasks";
	if (width < 64) {
		return [
			theme.fg("accent", `${counts.total} ${noun}`),
			theme.fg("muted", " · "),
			theme.fg("accent", `◼${counts.inProgress}`),
		].join("");
	}
	return [
		theme.fg("accent", `${counts.total} ${noun}`),
		theme.fg("muted", " ("),
		theme.fg("accent", `${counts.inProgress} in progress`),
		theme.fg("muted", ")"),
	].join("");
}

function getSessionWidgetTodos(
	todos: TodoFrontMatter[],
	currentSessionId?: string,
): TodoFrontMatter[] {
	if (!currentSessionId) return [];
	const sessionTodos = sortTodos(
		todos.filter((todo) => todo.assigned_to_session === currentSessionId),
	);
	const activeTodos = sessionTodos.filter((todo) => !isTodoClosed(getTodoStatus(todo)));
	return activeTodos.length ? activeTodos : sessionTodos;
}

function renderTodoWidgetRow(
	theme: Theme,
	todo: TodoFrontMatter,
	width: number,
): string {
	const closed = isTodoClosed(getTodoStatus(todo));
	const active = !closed && isActiveStatus(todo);
	const glyph = closed
		? theme.fg("success", "✔")
		: active
			? theme.fg("accent", "◼")
			: theme.fg("dim", "◻");
	const titleColor = closed ? "dim" : "text";
	const showTags = width >= 78;
	const tagText = showTags && todo.tags.length ? theme.fg("dim", ` [${todo.tags.join(", ")}]`) : "";
	// Display activeForm for in-progress items, otherwise use title
	const displayTitle = active && todo.activeForm ? todo.activeForm : getTodoTitle(todo);
	return `${glyph} ${theme.fg(titleColor, displayTitle)}${tagText}`;
}

function getTodoWidgetShortcutLabel(): string {
	return process.platform === "darwin" ? "ctrl+opt+t" : "Ctrl+Alt+T";
}

// === WIDGET ===

function renderTodoWidgetLines(
	theme: Theme,
	state: TodoWidgetState,
	width: number,
): string[] {
	// Compact Claude-inspired layout:
	// 1. Summary line with counts
	// 2. Up to TODO_WIDGET_VISIBLE_ROWS items
	// 3. Overflow line when additional todos exist
	// 4. Final toggle hint
	const todos = state.todos;
	const lines = [renderTodoWidgetSummary(theme, todos, width)];
	const visibleTodos = todos.slice(0, TODO_WIDGET_VISIBLE_ROWS);
	const shortcutLabel = getTodoWidgetShortcutLabel();

	for (const todo of visibleTodos) {
		lines.push(`  ${renderTodoWidgetRow(theme, todo, width)}`);
	}

	if (todos.length > visibleTodos.length) {
		lines.push(theme.fg("dim", `  ... ${todos.length - visibleTodos.length} more`));
	}

	if (state.showShortcutHint) {
		lines.push(theme.fg("dim", width < 64 ? `${shortcutLabel} hide` : `${shortcutLabel} to hide tasks`));
	}
	return lines;
}

function scheduleWidgetAutoHide(ctx: ExtensionContext, state: TodoWidgetState): void {
	if (!ctx.hasUI) return;
	cancelWidgetAutoHide();
	autoHideTimer = setTimeout(() => {
		autoHideTimer = null;
		try {
			cancelWidgetShortcutHintHide();
			state.showShortcutHint = false;
			state.todos = [];
			applyTodoWidget(ctx, state);
		} catch (error) {
			logTodoWarning("Failed to auto-hide todo widget", error);
		}
	}, TODO_WIDGET_COMPLETED_AUTO_HIDE_MS);
}

function cancelWidgetAutoHide(): void {
	if (autoHideTimer) {
		clearTimeout(autoHideTimer);
		autoHideTimer = null;
	}
}

function scheduleWidgetShortcutHintHide(ctx: ExtensionContext, state: TodoWidgetState): void {
	if (!ctx.hasUI || !isTodoWidgetVisible(state)) return;
	cancelWidgetShortcutHintHide();
	shortcutHintHideTimer = setTimeout(() => {
		shortcutHintHideTimer = null;
		if (!isTodoWidgetVisible(state) || !state.showShortcutHint) {
			return;
		}
		try {
			state.showShortcutHint = false;
			applyTodoWidget(ctx, state);
		} catch (error) {
			logTodoWarning("Failed to hide todo widget shortcut hint", error);
		}
	}, TODO_WIDGET_SHORTCUT_HINT_HIDE_MS);
}

function cancelWidgetShortcutHintHide(): void {
	if (shortcutHintHideTimer) {
		clearTimeout(shortcutHintHideTimer);
		shortcutHintHideTimer = null;
	}
}

function showTodoWidgetShortcutHint(ctx: ExtensionContext, state: TodoWidgetState): void {
	state.showShortcutHint = true;
	scheduleWidgetShortcutHintHide(ctx, state);
}

function applyTodoWidget(ctx: ExtensionContext, state: TodoWidgetState): void {
	if (!ctx.hasUI) return;
	if (!isTodoWidgetVisible(state)) {
		ctx.ui.setWidget(TODO_WIDGET_ID, undefined);
		return;
	}

	ctx.ui.setWidget(
		TODO_WIDGET_ID,
		(_tui, theme) => ({
			render(width: number) {
				return renderTodoWidgetLines(theme, state, width).map((line) => truncateToWidth(line, width));
			},
			invalidate() {},
		}),
		{ placement: "belowEditor" },
	);
}

async function refreshTodoWidget(ctx: ExtensionContext, state: TodoWidgetState): Promise<void> {
	if (!ctx.hasUI) {
		cancelWidgetAutoHide();
		cancelWidgetShortcutHintHide();
		state.todos = [];
		state.showShortcutHint = false;
		return;
	}
	const wasVisible = isTodoWidgetVisible(state);
	state.currentSessionId = ctx.sessionManager.getSessionId();
	const result = await listTodos(getTodosDir(ctx.cwd));
	if (result.error) {
		logTodoWarning(`Failed to load todos for widget: ${result.error}`);
	}
	state.todos = getSessionWidgetTodos(result.todos, state.currentSessionId);
	const isVisible = isTodoWidgetVisible(state);
	if (!isVisible) {
		cancelWidgetShortcutHintHide();
		state.showShortcutHint = false;
	} else if (!wasVisible) {
		showTodoWidgetShortcutHint(ctx, state);
	}
	// Auto-hide widget after 5s when all session todos are completed.
	// While work is active, show only open items. Once everything is completed,
	// keep the completed session todos visible briefly before hiding the widget.
	const hasActiveTodos = state.todos.some((t) => !isTodoClosed(getTodoStatus(t)));
	if (!hasActiveTodos && state.todos.length > 0) {
		scheduleWidgetAutoHide(ctx, state);
	} else {
		cancelWidgetAutoHide();
	}
	applyTodoWidget(ctx, state);
}

async function toggleTodoWidget(
	ctx: ExtensionContext,
	state: TodoWidgetState,
	pi: ExtensionAPI,
): Promise<void> {
	state.hidden = !state.hidden;
	pi.appendEntry(TODO_WIDGET_STATE_TYPE, { hidden: state.hidden });
	if (!state.hidden) {
		cancelWidgetAutoHide();
		showTodoWidgetShortcutHint(ctx, state);
		await refreshTodoWidget(ctx, state);
		ctx.ui.notify("Todo widget shown", "info");
		return;
	}
	cancelWidgetAutoHide();
	cancelWidgetShortcutHintHide();
	state.showShortcutHint = false;
	applyTodoWidget(ctx, state);
	ctx.ui.notify("Todo widget hidden", "info");
}

function isContinuationPrompt(text: string): boolean {
	const normalized = text.trim().toLowerCase();
	if (!normalized) return false;
	return [
		"continue",
		"go ahead",
		"keep going",
		"keep working",
		"proceed",
		"carry on",
		"finish it",
		"finish this",
		"next",
	].some((phrase) => normalized === phrase || normalized.includes(phrase));
}

function countChecklistLines(text: string): number {
	return text
		.split(/\r?\n/)
		.filter((line) => /^\s*(?:[-*]|\d+[.)])\s+/.test(line.trim())).length;
}

function isLikelyTodoWorthyPrompt(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return false;

	const normalized = trimmed.toLowerCase();
	const checklistLines = countChecklistLines(trimmed);
	if (checklistLines >= 2) return true;

	const actionMatches = normalized.match(/\b(add|build|fix|implement|investigate|refactor|review|update|write|run|test|verify|clean up|audit|debug|migrate|optimize)\b/g) ?? [];
	const hasExplicitMulti = /\b(multi-step|multiple|several|complex|non-trivial|end-to-end|step by step)\b/.test(normalized);
	const hasJoinedRequirements = /\b(and|then|also|plus)\b/.test(normalized) || trimmed.includes(",");
	const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

	if (hasExplicitMulti && actionMatches.length >= 1) return true;
	if (actionMatches.length >= 2 && hasJoinedRequirements) return true;
	if (actionMatches.length >= 3) return true;
	if (wordCount >= 30 && actionMatches.length >= 2) return true;

	return false;
}

function shouldSuppressTodoReminder(todos: TodoFrontMatter[], currentSessionId?: string): boolean {
	const visibleTodos = filterVisibleTodosForSession(todos, currentSessionId);
	return visibleTodos.some((todo) => !isTodoClosed(getTodoStatus(todo)));
}

// Check if verification nudge should be shown after completing todos
// Returns nudge text if conditions met, null otherwise
async function checkVerificationNudge(todosDir: string, currentSessionId?: string): Promise<string | null> {
	const result = await listTodos(todosDir);
	if (result.error) {
		if (!result.todos.length) {
			logTodoWarning(`Verification nudge skipped due to todo loading error: ${result.error}`);
			return null;
		}
		logTodoWarning(`Verification nudge using partial todo list due to loading error: ${result.error}`);
	}
	if (!result.todos.length) return null;
	const todos = filterVisibleTodosForSession(result.todos, currentSessionId);
	if (!todos.length) return null;
	// Check if all visible todos are completed
	if (!todos.every((t) => isTodoClosed(getTodoStatus(t)))) return null;
	// Check minimum count threshold
	if (todos.length < TODO_VERIFICATION_MIN_COUNT) return null;
	// Check if any todo has verification-related title or activeForm
	const hasVerificationStep = todos.some((t) => {
		const searchText = `${t.title} ${t.activeForm ?? ""}`;
		return VERIFICATION_KEYWORDS.test(searchText);
	});
	if (hasVerificationStep) return null;
	// All conditions met - return nudge
	return `\n\nNote: You closed out ${todos.length} tasks without an explicit verification step. Consider verifying your changes before summarizing.`;
}

function getPromptText(prompt: unknown): string {
	if (typeof prompt === "string") return prompt;
	if (Array.isArray(prompt)) {
		return prompt
			.filter((block): block is { type: string; text?: string } => Boolean(block) && typeof block === "object")
			.filter((block) => block.type === "text" && typeof block.text === "string")
			.map((block) => block.text ?? "")
			.join("\n");
	}
	return "";
}

function buildTodoReminderSystemPrompt(): string {
	return [
		"Internal reminder: the `todo` tool has not been used recently.",
		"If the current work is non-trivial and would benefit from progress tracking, consider using `todo`.",
		"Only do this if it is actually relevant to the work.",
		"If existing todos are stale, consider cleaning them up so they match the work in progress.",
		"Do not mention this reminder to the user.",
	].join(" ");
}

function isAssistantTurnMessage(message: unknown): boolean {
	return Boolean(
		message &&
		typeof message === "object" &&
		"role" in message &&
		(message as { role?: string }).role === "assistant",
	);
}

async function ensureTodoExists(
	filePath: string,
	id: string,
): Promise<TodoRecord | null | { error: string }> {
	if (!existsSync(filePath)) return null;
	try {
		return await readTodoFile(filePath, id);
	} catch (error) {
		return { error: `Failed to read todo ${displayTodoId(id)}: ${getErrorMessage(error)}` };
	}
}

function applyBodyAppend(todo: TodoRecord, text: string): void {
	const spacer = todo.body.trim().length ? "\n\n" : "";
	todo.body = `${todo.body.replace(/\s+$/, "")}${spacer}${text.trim()}\n`;
}

async function appendTodoBody(filePath: string, todo: TodoRecord, text: string): Promise<TodoRecord> {
	applyBodyAppend(todo, text);
	await writeTodoFile(filePath, todo);
	return todo;
}

async function claimTodoAssignment(
	todosDir: string,
	id: string,
	ctx: ExtensionContext,
	force = false,
	opts?: { activeForm?: string; skipAutoStart?: boolean },
): Promise<TodoRecord | { error: string }> {
	const validated = validateTodoId(id);
	if ("error" in validated) {
		return { error: validated.error };
	}
	const normalizedId = validated.id;
	const filePath = getTodoPath(todosDir, normalizedId);
	const displayId = formatTodoId(normalizedId);
	const sessionId = ctx.sessionManager.getSessionId();
	const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
		const existing = await ensureTodoExists(filePath, normalizedId);
		if (!existing) return { error: `Todo ${displayId} not found` } as const;
		if ("error" in existing) return existing;
		const startResult = applyStartToTodo(existing, sessionId, displayId, {
			force,
			activeForm: opts?.activeForm,
			skipAutoStart: opts?.skipAutoStart,
		});
		if ("error" in startResult) {
			return startResult;
		}
		if (startResult.dirty) {
			await writeTodoFile(filePath, existing);
		}
		return existing;
	});

	if (typeof result === "object" && "error" in result) {
		return { error: result.error };
	}

	return result;
}

async function releaseTodoAssignment(
	todosDir: string,
	id: string,
	ctx: ExtensionContext,
	force = false,
): Promise<TodoRecord | { error: string }> {
	const validated = validateTodoId(id);
	if ("error" in validated) {
		return { error: validated.error };
	}
	const normalizedId = validated.id;
	const filePath = getTodoPath(todosDir, normalizedId);
	const displayId = formatTodoId(normalizedId);
	const sessionId = ctx.sessionManager.getSessionId();
	const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
		const existing = await ensureTodoExists(filePath, normalizedId);
		if (!existing) return { error: `Todo ${displayId} not found` } as const;
		if ("error" in existing) return existing;
		const assigned = existing.assigned_to_session;
		if (!assigned) {
			return existing;
		}
		if (assigned !== sessionId && !force) {
			return {
				error: `Todo ${displayId} is assigned to session ${assigned}. Use force to release.`,
			} as const;
		}
		existing.assigned_to_session = undefined;
		if (normalizeStatus(existing.status) === "in_progress") {
			existing.status = "pending";
		}
		normalizeLifecycleFields(existing);
		await writeTodoFile(filePath, existing);
		return existing;
	});

	if (typeof result === "object" && "error" in result) {
		return { error: result.error };
	}

	return result;
}

async function deleteTodo(
	todosDir: string,
	id: string,
	ctx: ExtensionContext,
): Promise<TodoRecord | { error: string }> {
	const validated = validateTodoId(id);
	if ("error" in validated) {
		return { error: validated.error };
	}
	const normalizedId = validated.id;
	const filePath = getTodoPath(todosDir, normalizedId);

	const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
		const existing = await ensureTodoExists(filePath, normalizedId);
		if (!existing) return { error: `Todo ${displayTodoId(id)} not found` } as const;
		if ("error" in existing) return existing;
		await fs.unlink(filePath);
		return existing;
	});

	if (typeof result === "object" && "error" in result) {
		return { error: result.error };
	}

	return result;
}

// === EXTENSION ENTRY ===

export default function todosExtension(pi: ExtensionAPI) {
	let reminderState = createDefaultTodoReminderState();
	let todoWidgetState = createDefaultTodoWidgetState();
	let usedTodoThisTurn = false;

	const restoreTodoExtensionState = async (ctx: ExtensionContext, runGarbageCollection = false) => {
		cancelWidgetAutoHide();
		const todosDir = getTodosDir(ctx.cwd);
		await ensureTodosDir(todosDir);
		if (runGarbageCollection) {
			const settings = await readTodoSettings(todosDir);
			await garbageCollectTodos(todosDir, settings);
		}

		reminderState = normalizeTodoReminderState(
			getLatestCustomEntryData<TodoReminderState>(ctx, TODO_REMINDER_STATE_TYPE, true),
		);
		const widgetPrefs = normalizeTodoWidgetPreferenceState(
			getLatestCustomEntryData<TodoWidgetPreferenceState>(ctx, TODO_WIDGET_STATE_TYPE, true),
		);
		todoWidgetState.hidden = widgetPrefs.hidden;
		await refreshTodoWidget(ctx, todoWidgetState);
	};

	pi.on("session_start", async (event, ctx) => {
		const shouldRunGarbageCollection = event.reason === "startup" || event.reason === "reload";
		await restoreTodoExtensionState(ctx, shouldRunGarbageCollection);
	});

	pi.on("session_tree", async (_event, ctx) => {
		await restoreTodoExtensionState(ctx);
	});

	pi.registerCommand("todo-widget", {
		description: "Toggle the live todo widget",
		handler: async (_args, ctx) => toggleTodoWidget(ctx, todoWidgetState, pi),
	});

	pi.registerShortcut(Key.ctrlAlt("t"), {
		description: "Toggle todo widget",
		handler: async (ctx) => toggleTodoWidget(ctx, todoWidgetState, pi),
	});

	pi.on("tool_call", async (event) => {
		if (event.toolName !== "todo") return;
		usedTodoThisTurn = true;
		reminderState.trackedWork = true;
		reminderState.turnsSinceTodo = 0;
		reminderState.turnsSinceReminder = TODO_REMINDER_COOLDOWN_TURNS;
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "todo") return;
		await refreshTodoWidget(ctx, todoWidgetState);
	});

	pi.on("before_agent_start", async (event, ctx) => {
		const promptText = getPromptText((event as { prompt?: unknown }).prompt);
		const promptLooksComplex = isLikelyTodoWorthyPrompt(promptText);
		if (promptLooksComplex) {
			reminderState.trackedWork = true;
		} else if (!reminderState.trackedWork && isContinuationPrompt(promptText)) {
			reminderState.trackedWork = true;
		}

		if (!reminderState.trackedWork) return;

		// process.cwd() is the project directory set at Pi startup. This is correct for
		// the active primary session. Sessions stored by Pi use an encoded path in their
		// directory name, so path.dirname(sessionFile) resolves to Pi internal storage,
		// not the project root — using it here would cause listTodosSync to always see
		// an empty directory and suppress the reminder permanently.
		const cwd = process.cwd();
		const result = listTodosSync(getTodosDir(cwd));
		if (result.error) {
			logTodoWarning(`Failed to load todos in before_agent_start: ${result.error}`);
		}
		if (shouldSuppressTodoReminder(result.todos, ctx.sessionManager.getSessionId())) return;
		if (reminderState.turnsSinceTodo < TODO_REMINDER_MIN_TURNS) return;
		if (reminderState.turnsSinceReminder < TODO_REMINDER_COOLDOWN_TURNS) return;

		reminderState.turnsSinceReminder = 0;
		return {
			systemPrompt: `${(event as { systemPrompt: string }).systemPrompt}\n\n${buildTodoReminderSystemPrompt()}`,
		};
	});

	pi.on("turn_end", async (event) => {
		if (!isAssistantTurnMessage((event as { message?: unknown }).message)) {
			usedTodoThisTurn = false;
			return;
		}

		if (!reminderState.trackedWork) {
			pi.appendEntry(TODO_REMINDER_STATE_TYPE, reminderState);
			usedTodoThisTurn = false;
			return;
		}

		if (usedTodoThisTurn) {
			reminderState.turnsSinceTodo = 0;
			reminderState.turnsSinceReminder = 0;
		} else {
			reminderState.turnsSinceTodo += 1;
			reminderState.turnsSinceReminder += 1;
		}

		pi.appendEntry(TODO_REMINDER_STATE_TYPE, reminderState);
		usedTodoThisTurn = false;
	});

	const todosDirLabel = getTodosDirLabel(process.cwd());

	pi.registerTool({
		name: "todo",
		label: "Todo",
		description:
			`Manage file-based todos in ${todosDirLabel} (list, list-all, get, create, create-many, update, append, delete, claim, release, advance). Use this tool proactively for non-trivial multi-step work.\n\n` +
			"WHEN TO USE:\n" +
			"- The task requires 3 or more distinct steps\n" +
			"- The user provides a list of requirements or changes\n" +
			"- Work spans multiple files or components\n" +
			"- The task is non-trivial and benefits from progress tracking\n\n" +
			"WHEN NOT TO USE:\n" +
			"- Single-step or trivial requests\n" +
			"- Purely conversational or informational exchanges\n\n" +
			"STATUSES:\n" +
			"  pending → in_progress → completed\n" +
			"  Legacy aliases accepted: open (→ pending), closed/done (→ completed)\n\n" +
			"FIELDS:\n" +
			"- title: imperative phrase (\"Fix auth bug\", \"Add regression tests\")\n" +
			"- activeForm: present-continuous label for in-progress display (\"Fixing auth bug\")\n" +
			"- body: long-form markdown notes (update replaces)\n" +
			"- append_body: text to append to existing body without replacing (works with update and advance)\n" +
			"- priority: high, medium, low\n" +
			"- blocks/blocked_by: declare task dependencies\n" +
			"- start: for create, create and immediately assign+start the todo in one call\n" +
			"- start_key: for create-many, local batch key of the item to assign and start immediately\n" +
			"- next_id: for advance, the next todo to claim after completing the current one\n" +
			"- items: for create-many, batch several new todos in one call; each item may include a local key for dependency references\n\n" +
			"COMPOUND ACTIONS (minimize tool calls):\n" +
			"- create with start: creates a todo and immediately assigns+starts it in one call.\n" +
			"- create-many with start_key: creates a batch and immediately assigns+starts the selected item in one call.\n" +
			"- claim: assigns ownership AND auto-promotes pending → in_progress. No separate update needed.\n" +
			"- advance: completes current todo (with optional append_body notes) AND claims+starts next_id in one call.\n" +
			"- update with append_body: change status and append notes in one call instead of separate append + update.\n\n" +
			"WORKFLOW:\n" +
			"1. list existing todos when resuming work\n" +
			"   `list` shows unassigned work plus this session's assigned todos; use `list-all` only for explicit cross-session inspection\n" +
			"2. create concrete, actionable todos for each step\n" +
			"   When creating several new todos at once, prefer create-many over repeated create calls; pass start_key to begin one immediately\n" +
			"3. Otherwise claim a todo to start work (auto-sets in_progress; pass activeForm for display label)\n" +
			"4. Append notes as you learn more, or use update with append_body to combine with status changes\n" +
			"5. Advance to complete current + start next in one call, or update status to completed if no next task\n" +
			"6. Release only if stopping ownership without finishing; active work is demoted back to pending\n" +
			"7. Prefer one in_progress todo per session\n\n" +
			"Todo ids are TODO-<hex>; id parameters accept TODO-<hex> or raw hex.\n\n" +
			"<example>\n" +
			"User: \"Update the auth flow, add regression tests, and verify the build passes.\"\n" +
			"→ create-many with 3 items and start_key=auth.\n" +
			"  After finishing each step, use advance with append_body for notes + next_id to move to the next, then update the last task to completed.\n" +
			"  Total: 1 create-many + 2 advance + 1 update = 4 calls for 3 tasks.\n" +
			"</example>\n\n" +
			"<example>\n" +
			"User: \"What does this regex do?\"\n" +
			"→ Answer directly. No todos needed — informational, no execution steps.\n" +
			"</example>\n\n" +
			"<example>\n" +
			"Efficient lifecycle for sequential tasks:\n" +
			"  1. create-many start_key=A, items=[A, B, C]     → A is in_progress\n" +
			"  2. advance id=A, append_body=notes, next_id=B   → A completed, B in_progress\n" +
			"  3. advance id=B, append_body=notes, next_id=C   → B completed, C in_progress\n" +
			"  4. update id=C, status=completed, append_body=notes → C completed\n" +
			"</example>",
		parameters: TodoParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const todosDir = getTodosDir(ctx.cwd);
			const action: TodoAction = params.action;
			const currentSessionId = ctx.sessionManager.getSessionId();

			switch (action) {
				case "list": {
					const result = await listTodos(todosDir);
					const visibleTodos = filterVisibleTodosForSession(result.todos, currentSessionId);
					const { assignedTodos, openTodos } = splitTodosByAssignment(visibleTodos);
					const listedTodos = [...assignedTodos, ...openTodos];
					return {
						content: [{
							type: "text",
							text: `${result.error ? `Warning: ${result.error}\n\n` : ""}${serializeTodoListForAgent(listedTodos)}`,
						}],
						details: { action: "list", todos: listedTodos, currentSessionId, error: result.error },
					};
				}

				case "list-all": {
					const result = await listTodos(todosDir);
					return {
						content: [{
							type: "text",
							text: `${result.error ? `Warning: ${result.error}\n\n` : ""}${serializeTodoListForAgent(result.todos)}`,
						}],
						details: { action: "list-all", todos: result.todos, currentSessionId, error: result.error },
					};
				}

				case "get": {
					if (!params.id) {
						return {
							content: [{ type: "text", text: "Error: id required" }],
							details: { action: "get", error: "id required" },
						};
					}
					const validated = validateTodoId(params.id);
					if ("error" in validated) {
						return {
							content: [{ type: "text", text: validated.error }],
							details: { action: "get", error: validated.error },
						};
					}
					const normalizedId = validated.id;
					const displayId = formatTodoId(normalizedId);
					const filePath = getTodoPath(todosDir, normalizedId);
					const todo = await ensureTodoExists(filePath, normalizedId);
					if (!todo) {
						return {
							content: [{ type: "text", text: `Todo ${displayId} not found` }],
							details: { action: "get", error: "not found" },
						};
					}
					if ("error" in todo) {
						return {
							content: [{ type: "text", text: todo.error }],
							details: { action: "get", error: todo.error },
						};
					}
					return {
						content: [{ type: "text", text: serializeTodoForAgent(todo) }],
						details: { action: "get", todo, currentSessionId },
					};
				}

				case "create": {
					if (!params.title) {
						return {
							content: [{ type: "text", text: "Error: title required" }],
							details: { action: "create", error: "title required" },
						};
					}
					const startRequested = Boolean(params.start);
					const startValidation = validateCreateStartState("Create", params.status, startRequested);
					if (startValidation.error) {
						return {
							content: [{ type: "text", text: startValidation.error }],
							details: { action: "create", error: startValidation.error },
						};
					}
					await ensureTodosDir(todosDir);
					const id = await generateTodoId(todosDir);
					const displayId = formatTodoId(id);
					const filePath = getTodoPath(todosDir, id);
					const todoResult = buildTodoRecord(id, {
						title: params.title,
						tags: params.tags,
						status: params.status,
						priority: params.priority,
						blocks: params.blocks,
						blocked_by: params.blocked_by,
						activeForm: params.activeForm,
						body: params.body,
					});
					if ("error" in todoResult) {
						return {
							content: [{ type: "text", text: todoResult.error }],
							details: { action: "create", error: todoResult.error },
						};
					}
					const todo = todoResult;

					const result = await withTodoLock(todosDir, id, ctx, async () => {
						if (startRequested) {
							const startResult = applyStartToTodo(todo, ctx.sessionManager.getSessionId(), displayId, {
								activeForm: params.activeForm,
							});
							if ("error" in startResult) {
								return startResult;
							}
						}
						await writeTodoFile(filePath, todo);
						return todo;
					});

					if (typeof result === "object" && "error" in result) {
						return {
							content: [{ type: "text", text: result.error }],
							details: { action: "create", error: result.error },
						};
					}

					return {
						content: [{ type: "text", text: serializeTodoForAgent(todo) }],
						details: { action: "create", todo, currentSessionId },
					};
				}

				case "create-many": {
					if (!Array.isArray(params.items) || params.items.length === 0) {
						return {
							content: [{ type: "text", text: "Error: items required" }],
							details: { action: "create-many", todos: [], error: "items required" },
						};
					}
					await ensureTodosDir(todosDir);

					const batchItems = params.items as TodoBatchCreateItem[];
					const reservedIds = new Set<string>();
					const seenKeys = new Set<string>();
					const keyToId = new Map<string, string>();
					const rawStartKey = typeof params.start_key === "string" ? params.start_key.trim() : "";
					if (params.start_key !== undefined && !rawStartKey) {
						const error = "start_key must be a non-empty batch key.";
						return {
							content: [{ type: "text", text: error }],
							details: { action: "create-many", todos: [], error },
						};
					}
					const plannedItems: Array<{ key?: string; id: string; input: TodoBatchCreateItem }> = [];

					for (let index = 0; index < batchItems.length; index += 1) {
						const item = batchItems[index];
						if (!item.title?.trim()) {
							const error = `Batch item ${index + 1} is missing a title.`;
							return {
								content: [{ type: "text", text: error }],
								details: { action: "create-many", todos: [], error },
							};
						}

						let key: string | undefined;
						if (typeof item.key === "string") {
							const keyResult = validateBatchKey(item.key, seenKeys);
							if ("error" in keyResult) {
								return {
									content: [{ type: "text", text: keyResult.error }],
									details: { action: "create-many", todos: [], error: keyResult.error },
								};
							}
							key = keyResult.key;
							seenKeys.add(key);
						}

						let id: string;
						try {
							id = await generateTodoId(todosDir, reservedIds);
						} catch (error) {
							const message = getErrorMessage(error);
							return {
								content: [{ type: "text", text: message }],
								details: { action: "create-many", todos: [], error: message },
							};
						}

						if (key) {
							keyToId.set(key, id);
						}
						plannedItems.push({ key, id, input: item });
					}

					const startId = rawStartKey ? keyToId.get(rawStartKey) : undefined;
					if (rawStartKey && !startId) {
						const error = `start_key "${rawStartKey}" does not match any batch item key.`;
						return {
							content: [{ type: "text", text: error }],
							details: { action: "create-many", todos: [], error },
						};
					}

					const plannedTodos: Array<{ todo: TodoRecord; shouldStart: boolean; activeForm?: string }> = [];
					// Resolve dependencies in a second pass so local-key forward references work.
					for (let index = 0; index < plannedItems.length; index += 1) {
						const plannedItem = plannedItems[index];
						const shouldStart = startId === plannedItem.id;
						const startValidation = validateCreateStartState(
							`Batch item ${index + 1}`,
							plannedItem.input.status,
							shouldStart,
							"start_key",
						);
						if (startValidation.error) {
							return {
								content: [{ type: "text", text: startValidation.error }],
								details: { action: "create-many", todos: [], error: startValidation.error },
							};
						}
						const blocksResult = resolveBatchDependencyIds(plannedItem.input.blocks, keyToId, "blocks", index);
						if ("error" in blocksResult) {
							return {
								content: [{ type: "text", text: blocksResult.error }],
								details: { action: "create-many", todos: [], error: blocksResult.error },
							};
						}
						const blockedByResult = resolveBatchDependencyIds(plannedItem.input.blocked_by, keyToId, "blocked_by", index);
						if ("error" in blockedByResult) {
							return {
								content: [{ type: "text", text: blockedByResult.error }],
								details: { action: "create-many", todos: [], error: blockedByResult.error },
							};
						}

						const todoResult = buildTodoRecord(plannedItem.id, {
							title: plannedItem.input.title,
							tags: plannedItem.input.tags,
							status: plannedItem.input.status,
							priority: plannedItem.input.priority,
							blocks: blocksResult.ids,
							blocked_by: blockedByResult.ids,
							activeForm: plannedItem.input.activeForm,
							body: plannedItem.input.body,
						});
						if ("error" in todoResult) {
							return {
								content: [{ type: "text", text: todoResult.error }],
								details: { action: "create-many", todos: [], error: todoResult.error },
							};
						}
						plannedTodos.push({
							todo: todoResult,
							shouldStart,
							activeForm: plannedItem.input.activeForm,
						});
					}

					const createdFiles: string[] = [];
					for (const plannedTodo of plannedTodos) {
						const { todo, shouldStart, activeForm } = plannedTodo;
						const filePath = getTodoPath(todosDir, todo.id);
						const displayId = formatTodoId(todo.id);
						const result = await withTodoLock(todosDir, todo.id, ctx, async () => {
							if (shouldStart) {
								const startResult = applyStartToTodo(todo, ctx.sessionManager.getSessionId(), displayId, {
									activeForm,
								});
								if ("error" in startResult) {
									return startResult;
								}
							}
							await writeTodoFile(filePath, todo);
							return todo;
						});

						if (typeof result === "object" && "error" in result) {
							for (const createdFile of createdFiles) {
								await fs.unlink(createdFile).catch((error) => {
									if (getErrorCode(error) !== "ENOENT") {
										logTodoWarning(`Failed to roll back created todo ${createdFile}`, error);
									}
								});
							}
							const rollbackMessage = createdFiles.length
								? ` ${createdFiles.length} created todo${createdFiles.length === 1 ? " was" : "s were"} rolled back.`
								: "";
							const error = `${result.error}${rollbackMessage}`;
							return {
								content: [{ type: "text", text: error }],
								details: { action: "create-many", todos: [], error },
							};
						}

						createdFiles.push(filePath);
					}

					const keyMap = Object.fromEntries(
						plannedItems
							.filter((plannedItem): plannedItem is { key: string; id: string; input: TodoBatchCreateItem } => typeof plannedItem.key === "string")
							.map((plannedItem) => [plannedItem.key, plannedItem.id]),
					);
					const todos = plannedTodos.map(({ todo }) => todo);

					return {
						content: [{ type: "text", text: serializeTodoCreateManyForAgent(todos, keyMap) }],
						details: { action: "create-many", todos, keyMap },
					};
				}

				case "update": {
					if (!params.id) {
						return {
							content: [{ type: "text", text: "Error: id required" }],
							details: { action: "update", error: "id required" },
						};
					}
					const validated = validateTodoId(params.id);
					if ("error" in validated) {
						return {
							content: [{ type: "text", text: validated.error }],
							details: { action: "update", error: validated.error },
						};
					}
					const normalizedId = validated.id;
					const displayId = formatTodoId(normalizedId);
					const filePath = getTodoPath(todosDir, normalizedId);
					let nextStatus = undefined as TodoStatus | undefined;
					if (params.status !== undefined) {
						const statusResult = validateTodoStatus(params.status);
						if ("error" in statusResult) {
							return {
								content: [{ type: "text", text: statusResult.error }],
								details: { action: "update", error: statusResult.error },
							};
						}
						nextStatus = statusResult.status;
					}
					const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
						const existing = await ensureTodoExists(filePath, normalizedId);
						if (!existing) return { error: `Todo ${displayId} not found` } as const;
						if ("error" in existing) return existing;
						if (nextStatus !== undefined && normalizeStatus(nextStatus) === "in_progress" && !existing.assigned_to_session) {
							return {
								error: `Todo ${displayId} cannot be moved to in_progress without assignment. Use claim to assign and start it.`,
							} as const;
						}

						existing.id = normalizedId;
						if (params.title !== undefined) existing.title = params.title;
						if (nextStatus !== undefined) existing.status = nextStatus;
						if (params.tags !== undefined) existing.tags = params.tags;
						if (params.body !== undefined) {
							existing.body = params.body;
						} else if (params.append_body?.trim()) {
							applyBodyAppend(existing, params.append_body);
						}
						if (params.priority !== undefined) {
							existing.priority = TODO_PRIORITIES.includes(params.priority as TodoPriority) ? (params.priority as TodoPriority) : undefined;
						}
						if (params.blocks !== undefined) {
							existing.blocks = params.blocks.map((b: string) => normalizeTodoId(b));
						}
						if (params.blocked_by !== undefined) {
							existing.blocked_by = params.blocked_by.map((b: string) => normalizeTodoId(b));
						}
						if (params.activeForm !== undefined) {
							existing.activeForm = params.activeForm || undefined;
						}
						if (!existing.created_at) existing.created_at = new Date().toISOString();
						normalizeLifecycleFields(existing);

						await writeTodoFile(filePath, existing);
						return existing;
					});

					if (typeof result === "object" && "error" in result) {
						return {
							content: [{ type: "text", text: result.error }],
							details: { action: "update", error: result.error },
						};
					}

					const updatedTodo = result as TodoRecord;
					// Check for verification nudge only when transitioning to completed
					let nudgeText: string | null = null;
					if (nextStatus && normalizeStatus(nextStatus) === "completed") {
						nudgeText = await checkVerificationNudge(todosDir, ctx.sessionManager.getSessionId());
					}
					return {
						content: [{ type: "text", text: serializeTodoForAgent(updatedTodo) + (nudgeText ?? "") }],
						details: { action: "update", todo: updatedTodo, currentSessionId },
					};
				}

				case "append": {
					if (!params.id) {
						return {
							content: [{ type: "text", text: "Error: id required" }],
							details: { action: "append", error: "id required" },
						};
					}
					const validated = validateTodoId(params.id);
					if ("error" in validated) {
						return {
							content: [{ type: "text", text: validated.error }],
							details: { action: "append", error: validated.error },
						};
					}
					const normalizedId = validated.id;
					const displayId = formatTodoId(normalizedId);
					const filePath = getTodoPath(todosDir, normalizedId);
					const result = await withTodoLock(todosDir, normalizedId, ctx, async () => {
						const existing = await ensureTodoExists(filePath, normalizedId);
						if (!existing) return { error: `Todo ${displayId} not found` } as const;
						if ("error" in existing) return existing;
						if (!params.body || !params.body.trim()) {
							return existing;
						}
						const updated = await appendTodoBody(filePath, existing, params.body);
						return updated;
					});

					if (typeof result === "object" && "error" in result) {
						return {
							content: [{ type: "text", text: result.error }],
							details: { action: "append", error: result.error },
						};
					}

					const updatedTodo = result as TodoRecord;
					return {
						content: [{ type: "text", text: serializeTodoForAgent(updatedTodo) }],
						details: { action: "append", todo: updatedTodo, currentSessionId },
					};
				}

				case "claim": {
					if (!params.id) {
						return {
							content: [{ type: "text", text: "Error: id required" }],
							details: { action: "claim", error: "id required" },
						};
					}
					const result = await claimTodoAssignment(
						todosDir,
						params.id,
						ctx,
						Boolean(params.force),
						{ activeForm: params.activeForm },
					);
					if (typeof result === "object" && "error" in result) {
						return {
							content: [{ type: "text", text: result.error }],
							details: { action: "claim", error: result.error },
						};
					}
					const updatedTodo = result as TodoRecord;
					return {
						content: [{ type: "text", text: serializeTodoForAgent(updatedTodo) }],
						details: { action: "claim", todo: updatedTodo, currentSessionId },
					};
				}

				case "release": {
					if (!params.id) {
						return {
							content: [{ type: "text", text: "Error: id required" }],
							details: { action: "release", error: "id required" },
						};
					}
					const result = await releaseTodoAssignment(
						todosDir,
						params.id,
						ctx,
						Boolean(params.force),
					);
					if (typeof result === "object" && "error" in result) {
						return {
							content: [{ type: "text", text: result.error }],
							details: { action: "release", error: result.error },
						};
					}
					const updatedTodo = result as TodoRecord;
					return {
						content: [{ type: "text", text: serializeTodoForAgent(updatedTodo) }],
						details: { action: "release", todo: updatedTodo, currentSessionId },
					};
				}

				case "advance": {
					if (!params.id) {
						return {
							content: [{ type: "text", text: "Error: id required (todo to complete)" }],
							details: { action: "advance", error: "id required" },
						};
					}
					const advValidated = validateTodoId(params.id);
					if ("error" in advValidated) {
						return {
							content: [{ type: "text", text: advValidated.error }],
							details: { action: "advance", error: advValidated.error },
						};
					}
					const advId = advValidated.id;
					const advDisplayId = formatTodoId(advId);
					const advFilePath = getTodoPath(todosDir, advId);

					// Step 1: Complete the current todo (with optional appended notes)
					const completeResult = await withTodoLock(todosDir, advId, ctx, async () => {
						const existing = await ensureTodoExists(advFilePath, advId);
						if (!existing) return { error: `Todo ${advDisplayId} not found` } as const;
						if ("error" in existing) return existing;
						if (params.body !== undefined) {
							existing.body = params.body;
						} else if (params.append_body?.trim()) {
							applyBodyAppend(existing, params.append_body);
						}
						existing.status = "completed";
						normalizeLifecycleFields(existing);
						await writeTodoFile(advFilePath, existing);
						return existing;
					});

					if (typeof completeResult === "object" && "error" in completeResult) {
						return {
							content: [{ type: "text", text: completeResult.error }],
							details: { action: "advance", error: completeResult.error },
						};
					}
					const completedTodo = completeResult as TodoRecord;

					// Step 2: If next_id provided, claim + start the next todo
					let nextTodo: TodoRecord | undefined;
					if (params.next_id) {
						const nextResult = await claimTodoAssignment(
							todosDir,
							params.next_id,
							ctx,
							Boolean(params.force),
							{ activeForm: params.activeForm },
						);
						if (typeof nextResult === "object" && "error" in nextResult) {
							// Completed todo succeeded but next failed — report both
							return {
								content: [{
									type: "text",
									text: `Completed ${advDisplayId}.\nFailed to start next: ${nextResult.error}`,
								}],
								details: { action: "advance", completed: completedTodo, error: nextResult.error },
							};
						}
						nextTodo = nextResult as TodoRecord;
					}

					// Check for verification nudge after completing
					const advNudgeText = await checkVerificationNudge(todosDir, ctx.sessionManager.getSessionId());
					const parts = [serializeTodoForAgent(completedTodo)];
					if (nextTodo) {
						parts.push(`\nStarted:\n${serializeTodoForAgent(nextTodo)}`);
					}
					if (advNudgeText) parts.push(advNudgeText);
					return {
						content: [{ type: "text", text: parts.join("") }],
						details: { action: "advance", completed: completedTodo, next: nextTodo },
					};
				}

				case "delete": {
					if (!params.id) {
						return {
							content: [{ type: "text", text: "Error: id required" }],
							details: { action: "delete", error: "id required" },
						};
					}

					const validated = validateTodoId(params.id);
					if ("error" in validated) {
						return {
							content: [{ type: "text", text: validated.error }],
							details: { action: "delete", error: validated.error },
						};
					}
					const result = await deleteTodo(todosDir, validated.id, ctx);
					if (typeof result === "object" && "error" in result) {
						return {
							content: [{ type: "text", text: result.error }],
							details: { action: "delete", error: result.error },
						};
					}

					// Check for verification nudge after deletion
					const nudgeText = await checkVerificationNudge(todosDir, ctx.sessionManager.getSessionId());
					return {
						content: [{ type: "text", text: serializeTodoForAgent(result as TodoRecord) + (nudgeText ?? "") }],
						details: { action: "delete", todo: result as TodoRecord, currentSessionId },
					};
				}
			}
		},


		renderCall(args, theme) {
			const action = typeof args.action === "string" ? args.action : "";
			const id = typeof args.id === "string" ? args.id : "";
			const normalizedId = id ? normalizeTodoId(id) : "";
			const title = typeof args.title === "string" ? args.title : "";
			const items = Array.isArray((args as { items?: unknown }).items)
				? ((args as { items: Array<{ title?: string }> }).items ?? [])
				: [];
			const firstItemTitle = typeof items[0]?.title === "string" ? items[0].title : "";
			const actionGlyphs: Record<string, string> = {
				list: "◉", "list-all": "◉",
				get: "◎", create: "+", "create-many": "+", update: "~", append: "~",
				delete: "×", claim: "→", release: "←",
			};
			const glyph = actionGlyphs[action] || "·";
			let text =
				theme.fg("toolTitle", theme.bold("todo")) +
				" " +
				theme.fg("dim", glyph) +
				" " +
				theme.fg("muted", action);
			if (action === "create-many" && items.length) {
				text += " " + theme.fg("text", `${items.length} item${items.length === 1 ? "" : "s"}`);
				if (firstItemTitle) {
					text += " " + theme.fg("dim", `(${firstItemTitle}${items.length > 1 ? ", ..." : ""})`);
				}
			} else if (title) {
				text += " " + theme.fg("text", `"${title}"`);
			} else if (normalizedId) {
				// Only show ID as fallback when no title is available
				text += " " + theme.fg("dim", normalizedId);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as TodoToolDetails | undefined;
			if (isPartial) {
				return new Text(theme.fg("warning", "Processing..."), 0, 0);
			}
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.action === "list" || details.action === "list-all") {
				let text = renderTodoList(
					theme,
					details.todos,
					expanded,
					details.currentSessionId,
					details.action === "list-all",
				);
				if (details.error) {
					text = `${theme.fg("warning", `Warning: ${details.error}`)}\n\n${text}`;
				}
				if (!expanded && details.action === "list-all") {
					const { displayTodos, rootTodos } = buildDisplayTodoTree(details.todos);
					const allCompleted =
						displayTodos.length > 0 &&
						displayTodos.every((todo) => isTodoClosed(getTodoStatus(todo)));
					const hasHiddenCompletedRoots = rootTodos.some((todo) => isTodoClosed(getTodoStatus(todo)));
					if (hasHiddenCompletedRoots) {
						text = appendExpandHint(theme, text, allCompleted);
					}
				}
				return new Text(text, 0, 0);
			}

			if (details.error) {
				return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			}

			if (details.action === "create-many") {
				const activeCount = details.todos.filter(
					(todo) => !isTodoClosed(getTodoStatus(todo)) && isActiveStatus(todo),
				).length;
				const completedCount = details.todos.filter((todo) => isTodoClosed(getTodoStatus(todo))).length;
				const pendingCount = details.todos.length - activeCount - completedCount;
				const breakdown: string[] = [];
				if (activeCount > 0) breakdown.push(theme.fg("accent", `${activeCount} active`));
				if (pendingCount > 0) breakdown.push(theme.fg("dim", `${pendingCount} pending`));
				if (completedCount > 0) breakdown.push(theme.fg("success", `${completedCount} complete`));
				let text =
					theme.fg("success", "✓ ") +
					theme.fg("muted", `Created ${details.todos.length} todo${details.todos.length === 1 ? "" : "s"}`);
				if (breakdown.length) {
					text += theme.fg("muted", " · ") + breakdown.join(theme.fg("muted", " · "));
				}
				text += `\n${renderTodoList(theme, details.todos, expanded)}`;
				if (expanded && details.keyMap && Object.keys(details.keyMap).length) {
					const keyLines = Object.entries(details.keyMap).map(
						([key, id]) => `  ${theme.fg("muted", key)} ${theme.fg("dim", "→")} ${theme.fg("accent", formatTodoId(id))}`,
					);
					text += `\n\n${theme.fg("muted", "batch keys")}\n${keyLines.join("\n")}`;
				}
				if (!expanded) {
					text = appendExpandHint(theme, text);
				}
				return new Text(text, 0, 0);
			}

			if (details.action === "advance") {
				const lines = [renderTodoStateSummary(theme, details.completed)];
				if (details.next) {
					lines.push(renderTodoStateSummary(theme, details.next));
				}
				return new Text(lines.join("\n"), 0, 0);
			}

			if (!("todo" in details)) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.action === "get") {
				let text = renderTodoDetail(theme, details.todo, expanded, details.currentSessionId);
				if (!expanded) {
					text = appendExpandHint(theme, text);
				}
				return new Text(text, 0, 0);
			}

			if (details.action === "delete") {
				return new Text(renderDeletedTodoSummary(theme, details.todo), 0, 0);
			}

			return new Text(renderTodoStateSummary(theme, details.todo, details.currentSessionId), 0, 0);
		},
	});


}
