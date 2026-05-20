import type { FileSystem, JsonlSessionMetadata, LeafEntry, SessionStorage, SessionTreeEntry } from "../types.js";
import { SessionError, toError } from "../types.js";
import { getFileSystemResultOrThrow } from "./repo-utils.js";
import { buildLabelsById, generateEntryId, leafIdAfterEntry, updateLabelCache } from "./storage-utils.js";

type JsonlSessionStorageFileSystem = Pick<FileSystem, "readTextFile" | "readTextLines" | "writeFile" | "appendFile">;

interface SessionHeader {
	type: "session";
	version: 3;
	id: string;
	timestamp: string;
	cwd: string;
	parentSession?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function invalidSession(filePath: string, message: string, cause?: Error): SessionError {
	return new SessionError("invalid_session", `Invalid JSONL session file ${filePath}: ${message}`, cause);
}

function invalidEntry(filePath: string, lineNumber: number, message: string, cause?: Error): SessionError {
	return new SessionError(
		"invalid_entry",
		`Invalid JSONL session file ${filePath}: line ${lineNumber} ${message}`,
		cause,
	);
}

function expectStringField(entry: Record<string, unknown>, field: string, filePath: string, lineNumber: number): void {
	if (typeof entry[field] !== "string" || entry[field] === "") {
		throw invalidEntry(filePath, lineNumber, `is missing ${field}`);
	}
}

function expectNumberField(entry: Record<string, unknown>, field: string, filePath: string, lineNumber: number): void {
	if (typeof entry[field] !== "number" || Number.isNaN(entry[field])) {
		throw invalidEntry(filePath, lineNumber, `is missing ${field}`);
	}
}

function expectOptionalBooleanField(
	entry: Record<string, unknown>,
	field: string,
	filePath: string,
	lineNumber: number,
): void {
	if (entry[field] !== undefined && typeof entry[field] !== "boolean") {
		throw invalidEntry(filePath, lineNumber, `has invalid ${field}`);
	}
}

function expectOptionalStringField(
	entry: Record<string, unknown>,
	field: string,
	filePath: string,
	lineNumber: number,
): void {
	if (entry[field] !== undefined && typeof entry[field] !== "string") {
		throw invalidEntry(filePath, lineNumber, `has invalid ${field}`);
	}
}

function validateEntryPayload(entry: Record<string, unknown>, filePath: string, lineNumber: number): void {
	switch (entry.type) {
		case "message":
			if (!isRecord(entry.message)) throw invalidEntry(filePath, lineNumber, "is missing message");
			break;
		case "thinking_level_change":
			expectStringField(entry, "thinkingLevel", filePath, lineNumber);
			break;
		case "model_change":
			expectStringField(entry, "provider", filePath, lineNumber);
			expectStringField(entry, "modelId", filePath, lineNumber);
			break;
		case "compaction":
			expectStringField(entry, "summary", filePath, lineNumber);
			expectStringField(entry, "firstKeptEntryId", filePath, lineNumber);
			expectNumberField(entry, "tokensBefore", filePath, lineNumber);
			expectOptionalBooleanField(entry, "fromHook", filePath, lineNumber);
			break;
		case "branch_summary":
			expectStringField(entry, "fromId", filePath, lineNumber);
			expectStringField(entry, "summary", filePath, lineNumber);
			expectOptionalBooleanField(entry, "fromHook", filePath, lineNumber);
			break;
		case "custom":
			expectStringField(entry, "customType", filePath, lineNumber);
			break;
		case "custom_message":
			expectStringField(entry, "customType", filePath, lineNumber);
			if (typeof entry.content !== "string" && !Array.isArray(entry.content)) {
				throw invalidEntry(filePath, lineNumber, "has invalid content");
			}
			if (typeof entry.display !== "boolean") throw invalidEntry(filePath, lineNumber, "has invalid display");
			break;
		case "label":
			expectStringField(entry, "targetId", filePath, lineNumber);
			expectOptionalStringField(entry, "label", filePath, lineNumber);
			break;
		case "session_info":
			expectOptionalStringField(entry, "name", filePath, lineNumber);
			break;
		case "leaf":
			if (entry.targetId !== null && typeof entry.targetId !== "string") {
				throw invalidEntry(filePath, lineNumber, "has invalid targetId");
			}
			break;
		default:
			throw invalidEntry(filePath, lineNumber, `has unknown entry type "${String(entry.type)}"`);
	}
}

function parseHeaderLine(line: string, filePath: string): SessionHeader {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch (error) {
		throw invalidSession(filePath, "first line is not a valid session header", toError(error));
	}
	if (!isRecord(parsed)) throw invalidSession(filePath, "first line is not a valid session header");
	if (parsed.type !== "session") throw invalidSession(filePath, "first line is not a valid session header");
	if (parsed.version !== 3) throw invalidSession(filePath, "unsupported session version");
	if (typeof parsed.id !== "string" || !parsed.id) throw invalidSession(filePath, "session header is missing id");
	if (typeof parsed.timestamp !== "string" || !parsed.timestamp) {
		throw invalidSession(filePath, "session header is missing timestamp");
	}
	if (typeof parsed.cwd !== "string" || !parsed.cwd) throw invalidSession(filePath, "session header is missing cwd");
	if (parsed.parentSession !== undefined && typeof parsed.parentSession !== "string") {
		throw invalidSession(filePath, "session header parentSession must be a string");
	}
	return {
		type: "session",
		version: 3,
		id: parsed.id,
		timestamp: parsed.timestamp,
		cwd: parsed.cwd,
		parentSession: parsed.parentSession,
	};
}

function parseEntryLine(line: string, filePath: string, lineNumber: number): SessionTreeEntry {
	let parsed: unknown;
	try {
		parsed = JSON.parse(line);
	} catch (error) {
		throw invalidEntry(filePath, lineNumber, "is not valid JSON", toError(error));
	}
	if (!isRecord(parsed)) throw invalidEntry(filePath, lineNumber, "is not a valid session entry");
	if (typeof parsed.type !== "string") throw invalidEntry(filePath, lineNumber, "is missing entry type");
	if (typeof parsed.id !== "string" || !parsed.id) throw invalidEntry(filePath, lineNumber, "is missing entry id");
	if (parsed.parentId !== null && typeof parsed.parentId !== "string") {
		throw invalidEntry(filePath, lineNumber, "has invalid parentId");
	}
	if (typeof parsed.timestamp !== "string" || !parsed.timestamp) {
		throw invalidEntry(filePath, lineNumber, "is missing timestamp");
	}
	validateEntryPayload(parsed, filePath, lineNumber);
	return parsed as unknown as SessionTreeEntry;
}

function headerToSessionMetadata(header: SessionHeader, path: string): JsonlSessionMetadata {
	return {
		id: header.id,
		createdAt: header.timestamp,
		cwd: header.cwd,
		path,
		parentSessionPath: header.parentSession,
	};
}

export async function loadJsonlSessionMetadata(
	fs: JsonlSessionStorageFileSystem,
	filePath: string,
): Promise<JsonlSessionMetadata> {
	const lines = getFileSystemResultOrThrow(
		await fs.readTextLines(filePath, { maxLines: 1 }),
		`Failed to read session header ${filePath}`,
	);
	const line = lines[0];
	if (line?.trim()) return headerToSessionMetadata(parseHeaderLine(line, filePath), filePath);
	throw invalidSession(filePath, "missing session header");
}

async function loadJsonlStorage(
	fs: JsonlSessionStorageFileSystem,
	filePath: string,
): Promise<{
	header: SessionHeader;
	entries: SessionTreeEntry[];
	leafId: string | null;
}> {
	const content = getFileSystemResultOrThrow(await fs.readTextFile(filePath), `Failed to read session ${filePath}`);
	const lines = content.split("\n").filter((line) => line.trim());
	if (lines.length === 0) {
		throw invalidSession(filePath, "missing session header");
	}

	const header = parseHeaderLine(lines[0]!, filePath);
	const entries: SessionTreeEntry[] = [];
	const entryIds = new Set<string>();
	let leafId: string | null = null;
	for (let i = 1; i < lines.length; i++) {
		const entry = parseEntryLine(lines[i]!, filePath, i + 1);
		if (entryIds.has(entry.id)) {
			throw invalidEntry(filePath, i + 1, `has duplicate entry id "${entry.id}"`);
		}
		entryIds.add(entry.id);
		entries.push(entry);
		leafId = leafIdAfterEntry(entry);
	}
	return { header, entries, leafId };
}

export class JsonlSessionStorage implements SessionStorage<JsonlSessionMetadata> {
	private readonly fs: JsonlSessionStorageFileSystem;
	private readonly filePath: string;
	private readonly metadata: JsonlSessionMetadata;
	private entries: SessionTreeEntry[];
	private byId: Map<string, SessionTreeEntry>;
	private labelsById: Map<string, string>;
	private currentLeafId: string | null;

	private constructor(
		fs: JsonlSessionStorageFileSystem,
		filePath: string,
		header: SessionHeader,
		entries: SessionTreeEntry[],
		leafId: string | null,
	) {
		this.fs = fs;
		this.filePath = filePath;
		this.metadata = headerToSessionMetadata(header, this.filePath);
		this.entries = entries;
		this.byId = new Map(entries.map((entry) => [entry.id, entry]));
		this.labelsById = buildLabelsById(entries);
		this.currentLeafId = leafId;
	}

	static async open(fs: JsonlSessionStorageFileSystem, filePath: string): Promise<JsonlSessionStorage> {
		const loaded = await loadJsonlStorage(fs, filePath);
		return new JsonlSessionStorage(fs, filePath, loaded.header, loaded.entries, loaded.leafId);
	}

	static async create(
		fs: JsonlSessionStorageFileSystem,
		filePath: string,
		options: {
			cwd: string;
			sessionId: string;
			parentSessionPath?: string;
		},
	): Promise<JsonlSessionStorage> {
		const header: SessionHeader = {
			type: "session",
			version: 3,
			id: options.sessionId,
			timestamp: new Date().toISOString(),
			cwd: options.cwd,
			parentSession: options.parentSessionPath,
		};
		getFileSystemResultOrThrow(
			await fs.writeFile(filePath, `${JSON.stringify(header)}\n`),
			`Failed to create session ${filePath}`,
		);
		return new JsonlSessionStorage(fs, filePath, header, [], null);
	}

	async getMetadata(): Promise<JsonlSessionMetadata> {
		return this.metadata;
	}

	async getLeafId(): Promise<string | null> {
		if (this.currentLeafId !== null && !this.byId.has(this.currentLeafId)) {
			throw new SessionError("invalid_session", `Entry ${this.currentLeafId} not found`);
		}
		return this.currentLeafId;
	}

	async setLeafId(leafId: string | null): Promise<void> {
		if (leafId !== null && !this.byId.has(leafId)) {
			throw new SessionError("not_found", `Entry ${leafId} not found`);
		}
		const entry: LeafEntry = {
			type: "leaf",
			id: generateEntryId(this.byId),
			parentId: this.currentLeafId,
			timestamp: new Date().toISOString(),
			targetId: leafId,
		};
		getFileSystemResultOrThrow(
			await this.fs.appendFile(this.filePath, `${JSON.stringify(entry)}\n`),
			`Failed to append session leaf ${entry.id}`,
		);
		this.entries.push(entry);
		this.byId.set(entry.id, entry);
		this.currentLeafId = leafId;
	}

	async createEntryId(): Promise<string> {
		return generateEntryId(this.byId);
	}

	async appendEntry(entry: SessionTreeEntry): Promise<void> {
		if (this.byId.has(entry.id)) {
			throw new SessionError("invalid_entry", `Entry ${entry.id} already exists`);
		}
		getFileSystemResultOrThrow(
			await this.fs.appendFile(this.filePath, `${JSON.stringify(entry)}\n`),
			`Failed to append session entry ${entry.id}`,
		);
		this.entries.push(entry);
		this.byId.set(entry.id, entry);
		updateLabelCache(this.labelsById, entry);
		this.currentLeafId = leafIdAfterEntry(entry);
	}

	async getEntry(id: string): Promise<SessionTreeEntry | undefined> {
		return this.byId.get(id);
	}

	async findEntries<TType extends SessionTreeEntry["type"]>(
		type: TType,
	): Promise<Array<Extract<SessionTreeEntry, { type: TType }>>> {
		return this.entries.filter((entry): entry is Extract<SessionTreeEntry, { type: TType }> => entry.type === type);
	}

	async getLabel(id: string): Promise<string | undefined> {
		return this.labelsById.get(id);
	}

	async getPathToRoot(leafId: string | null): Promise<SessionTreeEntry[]> {
		if (leafId === null) return [];
		const path: SessionTreeEntry[] = [];
		let current = this.byId.get(leafId);
		if (!current) throw new SessionError("not_found", `Entry ${leafId} not found`);
		while (current) {
			path.unshift(current);
			if (!current.parentId) break;
			const parent = this.byId.get(current.parentId);
			if (!parent) throw new SessionError("invalid_session", `Entry ${current.parentId} not found`);
			current = parent;
		}
		return path;
	}

	async getEntries(): Promise<SessionTreeEntry[]> {
		return [...this.entries];
	}
}
