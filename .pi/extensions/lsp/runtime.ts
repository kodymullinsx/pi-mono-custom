import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
	CancellationTokenSource,
	type MessageConnection,
	StreamMessageReader,
	StreamMessageWriter,
	createMessageConnection,
} from "vscode-jsonrpc/node.js";
import type { LspServerConfig } from "./config.ts";

export type LspOperation =
	| "goToDefinition"
	| "findReferences"
	| "hover"
	| "documentSymbol"
	| "goToImplementation";

export interface PositionInput {
	line: number;
	column: number;
}

export interface LspPosition {
	line: number;
	character: number;
}

export interface DocumentState {
	uri: string;
	path: string;
	languageId: string;
	version: number;
	text: string;
}

export interface ServerStatusSnapshot {
	language: string;
	rootUri: string;
	rootPath: string;
	state: "idle" | "starting" | "ready" | "failed";
	pid?: number;
	openDocuments: number;
	lastError?: string;
	cleanupWarnings?: string[];
	restartAttempts: number;
	retryAt?: string;
}

export interface ExecuteLspRequest {
	cwd: string;
	language: string;
	serverConfig: LspServerConfig;
	filePath: string;
	operation: LspOperation;
	line?: number;
	column?: number;
	includeDeclaration?: boolean;
	signal?: AbortSignal;
}

export interface ExecuteLspResponse {
	operation: LspOperation;
	language: string;
	rawResult: unknown;
	server: ServerStatusSnapshot;
}

interface RequestSender {
	sendRequest(method: string, params: unknown, token?: unknown): Promise<unknown>;
}

interface ServerEntry {
	key: string;
	language: string;
	config: LspServerConfig;
	rootUri: string;
	rootPath: string;
	state: "idle" | "starting" | "ready" | "failed";
	child?: ChildProcessWithoutNullStreams;
	connection?: MessageConnection;
	capabilities?: Record<string, unknown>;
	openDocs: Map<string, DocumentState>;
	cleanupWarnings: string[];
	lastError?: string;
	pid?: number;
	startupPromise?: Promise<ServerEntry>;
	restartAttempts: number;
	retryAt?: number;
	stopping: boolean;
	permanentFailure: boolean;
	stderrLines: string[];
}

export interface FilterIgnoredPathsResult<T extends { path: string }> {
	kept: T[];
	filtered: number;
	filterAbandoned?: boolean;
	filterWarning?: string;
}

const REQUEST_METHODS: Record<LspOperation, string> = {
	goToDefinition: "textDocument/definition",
	findReferences: "textDocument/references",
	hover: "textDocument/hover",
	documentSymbol: "textDocument/documentSymbol",
	goToImplementation: "textDocument/implementation",
};

const MAX_STDERR_LINES = 20;
const MAX_FILTER_BATCH = 512;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatProcessExit(code: number | null, signal: NodeJS.Signals | null): string {
	if (signal) {
		return `signal ${signal}`;
	}
	return code === null ? "unknown exit" : `exit code ${code}`;
}

function appendStderr(entry: ServerEntry, chunk: Buffer | string): void {
	const text = chunk.toString();
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed) {
			continue;
		}
		entry.stderrLines.push(trimmed);
	}
	if (entry.stderrLines.length > MAX_STDERR_LINES) {
		entry.stderrLines.splice(0, entry.stderrLines.length - MAX_STDERR_LINES);
	}
}

function stderrSuffix(entry: ServerEntry): string {
	if (entry.stderrLines.length === 0) {
		return "";
	}
	return ` Stderr: ${entry.stderrLines.slice(-3).join(" | ")}`;
}

function isMissingBinaryError(error: unknown): boolean {
	if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "ENOENT") {
		return true;
	}
	const message = error instanceof Error ? error.message : String(error);
	return message.includes("ENOENT");
}

function isGitRepositoryMissing(stderr: string): boolean {
	return /not a git repository/i.test(stderr);
}

async function runCommand(command: string, args: string[], cwd: string, input?: string): Promise<{
	code: number;
	stdout: string;
	stderr: string;
}> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			const message = stderr ? `${error.message} (${stderr.trim()})` : error.message;
			reject(new Error(message));
		});
		child.on("close", (code) => {
			resolve({ code: code ?? 1, stdout, stderr });
		});

		if (input) {
			child.stdin.write(input);
		}
		child.stdin.end();
	});
}

export class RequestTimeoutError extends Error {
	constructor(method: string, timeoutMs: number) {
		super(`LSP request ${method} timed out after ${timeoutMs}ms`);
		this.name = "RequestTimeoutError";
	}
}

export class RequestCancelledError extends Error {
	constructor(method: string) {
		super(`LSP request ${method} was cancelled`);
		this.name = "RequestCancelledError";
	}
}

export function toProtocolPosition(position: PositionInput): LspPosition {
	return {
		line: Math.max(0, position.line - 1),
		character: Math.max(0, position.column - 1),
	};
}

export function createDocumentState(uri: string, filePath: string, languageId: string, text: string): DocumentState {
	return {
		uri,
		path: filePath,
		languageId,
		version: 1,
		text,
	};
}

export function applyDocumentUpdate(state: DocumentState, text: string): { changed: boolean; next: DocumentState } {
	if (state.text === text) {
		return { changed: false, next: state };
	}
	return {
		changed: true,
		next: {
			...state,
			version: state.version + 1,
			text,
		},
	};
}

export function toDocumentUri(filePath: string): string {
	return pathToFileURL(path.resolve(filePath)).toString();
}

export function fromDocumentUri(uri: string): string | undefined {
	if (!uri.startsWith("file://")) {
		return undefined;
	}
	return fileURLToPath(uri);
}

export function resolveRootSettings(rootUriSetting: string | null | undefined, cwd: string): { rootUri: string; rootPath: string } {
	if (rootUriSetting === undefined || rootUriSetting === null || rootUriSetting === "") {
		const rootPath = path.resolve(cwd);
		return {
			rootUri: pathToFileURL(rootPath).toString(),
			rootPath,
		};
	}

	const trimmed = rootUriSetting.trim();
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
		if (trimmed.startsWith("file://")) {
			const rootPath = fileURLToPath(trimmed);
			return {
				rootUri: pathToFileURL(rootPath).toString(),
				rootPath,
			};
		}
		return {
			rootUri: trimmed,
			rootPath: path.resolve(cwd),
		};
	}

	const rootPath = path.resolve(cwd, trimmed);
	return {
		rootUri: pathToFileURL(rootPath).toString(),
		rootPath,
	};
}

export async function requestWithTimeout<T>(
	connection: RequestSender,
	method: string,
	params: unknown,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<T> {
	const tokenSource = new CancellationTokenSource();
	let abortHandler: (() => void) | undefined;
	let timeoutId: ReturnType<typeof setTimeout> | undefined;

	const requestPromise = Promise.resolve(connection.sendRequest(method, params, tokenSource.token)) as Promise<T>;
	const timeoutPromise = new Promise<never>((_resolve, reject) => {
		timeoutId = setTimeout(() => {
			tokenSource.cancel();
			reject(new RequestTimeoutError(method, timeoutMs));
		}, timeoutMs);
	});
	const abortPromise = signal
		? new Promise<never>((_resolve, reject) => {
				if (signal.aborted) {
					tokenSource.cancel();
					reject(new RequestCancelledError(method));
					return;
				}
				abortHandler = () => {
					tokenSource.cancel();
					reject(new RequestCancelledError(method));
				};
				signal.addEventListener("abort", abortHandler, { once: true });
			})
		: undefined;

	try {
		const racers = abortPromise ? [requestPromise, timeoutPromise, abortPromise] : [requestPromise, timeoutPromise];
		return await Promise.race(racers);
	} finally {
		if (timeoutId) {
			clearTimeout(timeoutId);
		}
		if (abortHandler) {
			signal?.removeEventListener("abort", abortHandler);
		}
		tokenSource.dispose();
	}
}

function capabilityEnabled(value: unknown): boolean {
	return value === true || isRecord(value);
}

function textDocumentSyncEnabled(capabilities: Record<string, unknown> | undefined): boolean {
	const sync = capabilities?.textDocumentSync;
	if (typeof sync === "number") {
		return sync !== 0;
	}
	if (!isRecord(sync)) {
		return true;
	}
	if (sync.change === 0) {
		return false;
	}
	return sync.openClose !== false || typeof sync.change === "number";
}

function summarizeCapabilityFailure(operation: LspOperation): string {
	switch (operation) {
		case "goToDefinition":
			return "The configured language server does not advertise definition support.";
		case "findReferences":
			return "The configured language server does not advertise reference support.";
		case "hover":
			return "The configured language server does not advertise hover support.";
		case "documentSymbol":
			return "The configured language server does not advertise document symbol support.";
		case "goToImplementation":
			return "The configured language server does not advertise implementation support.";
	}
}

export async function filterIgnoredPaths<T extends { path: string }>(
	cwd: string,
	items: T[],
): Promise<FilterIgnoredPathsResult<T>> {
	if (items.length === 0) {
		return { kept: items, filtered: 0 };
	}

	const rootProbe = await runCommand("git", ["-C", cwd, "rev-parse", "--show-toplevel"], cwd).catch((error) => ({
		code: -1,
		stdout: "",
		stderr: error instanceof Error ? error.message : String(error),
	}));
	if (rootProbe.code !== 0) {
		const stderr = rootProbe.stderr.trim();
		if (isGitRepositoryMissing(stderr)) {
			return { kept: items, filtered: 0 };
		}
		return {
			kept: items,
			filtered: 0,
			filterAbandoned: true,
			filterWarning: stderr ? `Git root probe failed: ${stderr}` : `Git root probe failed with status ${rootProbe.code}`,
		};
	}

	const repoRoot = rootProbe.stdout.trim();
	if (!repoRoot) {
		return { kept: items, filtered: 0 };
	}

	const relativeByPath = new Map<string, string>();
	for (const item of items) {
		if (!path.isAbsolute(item.path)) {
			continue;
		}
		const absolutePath = path.resolve(item.path);
		if (absolutePath !== repoRoot && !absolutePath.startsWith(`${repoRoot}${path.sep}`)) {
			continue;
		}
		const relativePath = path.relative(repoRoot, absolutePath);
		if (relativePath && !relativePath.startsWith("..")) {
			relativeByPath.set(item.path, relativePath);
		}
	}

	if (relativeByPath.size === 0) {
		return { kept: items, filtered: 0 };
	}

	const ignored = new Set<string>();
	const uniqueRelativePaths = Array.from(new Set(relativeByPath.values()));
	let filterAbandoned = false;
	let filterWarning: string | undefined;
	for (let index = 0; index < uniqueRelativePaths.length; index += MAX_FILTER_BATCH) {
		const batch = uniqueRelativePaths.slice(index, index + MAX_FILTER_BATCH);
		const probe = await runCommand("git", ["-C", repoRoot, "check-ignore", "--stdin"], repoRoot, `${batch.join("\n")}\n`).catch(
			(error) => {
				filterWarning = `Gitignore check command failed: ${error instanceof Error ? error.message : String(error)}`;
				return undefined;
			},
		);
		if (!probe || (probe.code !== 0 && probe.code !== 1)) {
			filterAbandoned = true;
			if (!filterWarning && probe) {
				const suffix = probe.stderr.trim();
				filterWarning = suffix
					? `Gitignore check (check-ignore) command returned status ${probe.code}: ${suffix}`
					: `Gitignore check (check-ignore) command returned unexpected status ${probe.code}`;
			}
			break;
		}
		for (const line of probe.stdout.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (trimmed) {
				ignored.add(trimmed);
			}
		}
	}

	const kept = items.filter((item) => {
		const relativePath = relativeByPath.get(item.path);
		return !relativePath || !ignored.has(relativePath);
	});

	return {
		kept,
		filtered: items.length - kept.length,
		...(filterAbandoned
			? {
				filterAbandoned: true,
				...(filterWarning ? { filterWarning } : {}),
			}
			: {}),
	};
}

export class LspRuntime {
	private readonly servers = new Map<string, ServerEntry>();

	getStatusEntries(): ServerStatusSnapshot[] {
		return Array.from(this.servers.values())
			.map((entry) => this.snapshotEntry(entry))
			.sort((left, right) => left.language.localeCompare(right.language) || left.rootPath.localeCompare(right.rootPath));
	}

	async reset(): Promise<void> {
		const entries = Array.from(this.servers.values());
		this.servers.clear();
		await Promise.all(entries.map((entry) => this.stopEntry(entry)));
	}

	async execute(request: ExecuteLspRequest): Promise<ExecuteLspResponse> {
		const { rootUri, rootPath } = resolveRootSettings(request.serverConfig.rootUri, request.cwd);
		const entry = await this.getOrStartServer(request.language, request.serverConfig, rootUri, rootPath, request.signal);
		this.ensureCapability(entry, request.operation);

		let text: string;
		try {
			text = await fs.readFile(request.filePath, "utf8");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Unable to read ${request.filePath}: ${message}`);
		}

		await this.syncDocument(entry, request.filePath, text);
		const rawResult = await requestWithTimeout<unknown>(
			entry.connection as MessageConnection,
			REQUEST_METHODS[request.operation],
			this.buildRequestParams(request),
			entry.config.requestTimeoutMs,
			request.signal,
		);

		return {
			operation: request.operation,
			language: request.language,
			rawResult,
			server: this.snapshotEntry(entry),
		};
	}

	private snapshotEntry(entry: ServerEntry): ServerStatusSnapshot {
		return {
			language: entry.language,
			rootUri: entry.rootUri,
			rootPath: entry.rootPath,
			state: entry.state,
			pid: entry.pid,
			openDocuments: entry.openDocs.size,
			cleanupWarnings: entry.cleanupWarnings.length === 0 ? undefined : [...entry.cleanupWarnings],
			lastError: entry.lastError,
			restartAttempts: entry.restartAttempts,
			retryAt: entry.retryAt ? new Date(entry.retryAt).toISOString() : undefined,
		};
	}

	private recordCleanupWarning(entry: ServerEntry, warning: string): void {
		entry.cleanupWarnings.push(warning);
		if (entry.cleanupWarnings.length > 3) {
			entry.cleanupWarnings.splice(0, entry.cleanupWarnings.length - 3);
		}
	}

	private serverKey(language: string, rootUri: string): string {
		return `${language}::${rootUri}`;
	}

	private async sendNotification(entry: ServerEntry, method: string, params: unknown, failureContext: string): Promise<void> {
		const connection = entry.connection;
		if (!connection) {
			const message = `${failureContext}: language server connection is unavailable`;
			entry.lastError = message;
			throw new Error(message);
		}
		try {
			await connection.sendNotification(method, params);
		} catch (error) {
			const message = `${failureContext}: ${error instanceof Error ? error.message : String(error)}`;
			entry.lastError = message;
			throw new Error(message);
		}
	}

	private ensureCapability(entry: ServerEntry, operation: LspOperation): void {
		const capabilities = entry.capabilities;
		let supportedProvider: unknown;
		switch (operation) {
			case "goToDefinition":
				supportedProvider = capabilities?.definitionProvider;
				break;
			case "findReferences":
				supportedProvider = capabilities?.referencesProvider;
				break;
			case "hover":
				supportedProvider = capabilities?.hoverProvider;
				break;
			case "documentSymbol":
				supportedProvider = capabilities?.documentSymbolProvider;
				break;
			case "goToImplementation":
				supportedProvider = capabilities?.implementationProvider;
				break;
		}
		const supported = capabilityEnabled(supportedProvider);

		if (!supported) {
			throw new Error(summarizeCapabilityFailure(operation));
		}
	}

	private async getOrStartServer(
		language: string,
		config: LspServerConfig,
		rootUri: string,
		rootPath: string,
		signal?: AbortSignal,
	): Promise<ServerEntry> {
		const key = this.serverKey(language, rootUri);
		const existing = this.servers.get(key);

		if (existing?.state === "ready") {
			return existing;
		}

		if (existing?.state === "starting" && existing.startupPromise) {
			return existing.startupPromise;
		}

		if (existing?.state === "failed") {
			if (existing.permanentFailure) {
				throw new Error(existing.lastError ?? `LSP server ${language} is in a failed state`);
			}
			if (existing.retryAt && existing.retryAt > Date.now()) {
				const remainingMs = existing.retryAt - Date.now();
				throw new Error(`${existing.lastError ?? `LSP server ${language} recently failed`}. Retry after ${remainingMs}ms.`);
			}
		}

		const entry: ServerEntry =
			existing ??
			{
				key,
				language,
				config,
				rootUri,
				rootPath,
				state: "idle",
				openDocs: new Map(),
				cleanupWarnings: [],
				restartAttempts: 0,
				stopping: false,
				permanentFailure: false,
				stderrLines: [],
			};

		entry.config = config;
		entry.rootUri = rootUri;
		entry.rootPath = rootPath;
		entry.state = "starting";
		entry.stopping = false;
		entry.cleanupWarnings = [];
		entry.lastError = undefined;
		entry.pid = undefined;
		entry.retryAt = undefined;
		entry.stderrLines = [];
		entry.startupPromise = this.startEntry(entry, signal).finally(() => {
			entry.startupPromise = undefined;
		});

		this.servers.set(key, entry);
		return entry.startupPromise;
	}

	private async startEntry(entry: ServerEntry, signal?: AbortSignal): Promise<ServerEntry> {
		const child = spawn(entry.config.command, entry.config.args, {
			cwd: entry.rootPath,
			stdio: ["pipe", "pipe", "pipe"],
			env: process.env,
		});
		entry.child = child;
		entry.pid = child.pid ?? undefined;

		child.stderr.on("data", (chunk) => {
			appendStderr(entry, chunk);
		});
		child.stdin.on("error", (error) => {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "EPIPE") {
				entry.lastError = `Language server stdin error: ${error.message}`;
			}
		});

		const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin));
		entry.connection = connection;
		connection.listen();

		let detachStartupListeners = () => {};
		try {
			const startupFailure = new Promise<never>((_resolve, reject) => {
				const onError = (error: Error) => {
					reject(error);
				};
				const onExit = (code: number | null, exitSignal: NodeJS.Signals | null) => {
					if (entry.stopping) {
						return;
					}
					reject(new Error(`Language server exited before initialization (${formatProcessExit(code, exitSignal)}).${stderrSuffix(entry)}`));
				};
				child.once("error", onError);
				child.once("exit", onExit);
				detachStartupListeners = () => {
					child.off("error", onError);
					child.off("exit", onExit);
				};
			});

			const initializeResult = (await Promise.race([
				requestWithTimeout<{ capabilities?: Record<string, unknown> }>(
					connection,
					"initialize",
					{
						processId: process.pid,
						rootUri: entry.rootUri,
						rootPath: entry.rootPath,
						capabilities: {
							textDocument: {
								definition: { linkSupport: true },
								implementation: { linkSupport: true },
								documentSymbol: { hierarchicalDocumentSymbolSupport: true },
								hover: { contentFormat: ["markdown", "plaintext"] },
							},
						},
						workspaceFolders: [
							{
								uri: entry.rootUri,
								name: path.basename(entry.rootPath),
							},
						],
						initializationOptions: entry.config.initializationOptions ?? {},
					},
					entry.config.startupTimeoutMs,
					signal,
				),
				startupFailure,
			])) as { capabilities?: Record<string, unknown> };

			detachStartupListeners();
			entry.capabilities = initializeResult.capabilities ?? {};
			await this.sendNotification(entry, "initialized", {}, `Failed to finalize startup for LSP server "${entry.language}"`);
			entry.state = "ready";
			entry.lastError = undefined;
			entry.permanentFailure = false;
			this.attachRuntimeListeners(entry);
			return entry;
		} catch (error) {
			detachStartupListeners();
			await this.failEntry(entry, this.formatStartupError(entry, error));
			throw new Error(entry.lastError);
		}
	}

	private attachRuntimeListeners(entry: ServerEntry): void {
		const child = entry.child;
		if (!child) {
			return;
		}

		child.once("error", (error) => {
			if (entry.stopping) {
				return;
			}
			this.markUnexpectedFailure(entry, this.formatStartupError(entry, error));
		});
		child.once("exit", (code, signal) => {
			if (entry.stopping) {
				return;
			}
			this.markUnexpectedFailure(entry, `Language server exited unexpectedly (${formatProcessExit(code, signal)}).${stderrSuffix(entry)}`);
		});
	}

	private markUnexpectedFailure(entry: ServerEntry, message: string): void {
		entry.state = "failed";
		entry.lastError = message;
		entry.connection?.dispose();
		entry.connection = undefined;
		entry.child = undefined;
		entry.pid = undefined;
		entry.capabilities = undefined;
		entry.openDocs.clear();
		entry.restartAttempts += 1;
		if (entry.restartAttempts >= 3) {
			entry.permanentFailure = true;
			entry.retryAt = undefined;
		} else {
			entry.retryAt = Date.now() + entry.restartAttempts * 1_000;
		}
	}

	private async failEntry(entry: ServerEntry, message: string): Promise<void> {
		entry.state = "failed";
		entry.lastError = message;
		entry.restartAttempts += 1;
		entry.permanentFailure = isMissingBinaryError(message);
		entry.retryAt = entry.permanentFailure || entry.restartAttempts >= 3 ? undefined : Date.now() + entry.restartAttempts * 1_000;
		await this.stopEntry(entry);
		entry.child = undefined;
		entry.connection = undefined;
		entry.pid = undefined;
		entry.capabilities = undefined;
		entry.openDocs.clear();
	}

	private async stopEntry(entry: ServerEntry): Promise<void> {
		entry.stopping = true;
		const connection = entry.connection;
		const child = entry.child;
		const cleanupWarnings: string[] = [];

		if (connection) {
			try {
				await Promise.race([
					connection.sendRequest("shutdown", undefined),
					new Promise((resolve) => setTimeout(resolve, 1_000)),
				]);
			} catch {
				cleanupWarnings.push("shutdown request failed during cleanup");
			}
			try {
				await connection.sendNotification("exit");
			} catch {
				cleanupWarnings.push("exit notification failed during cleanup");
			}
			try {
				connection.dispose();
			} catch {
				cleanupWarnings.push("connection dispose failed during cleanup");
			}
		}

		if (child && !child.killed) {
			try {
				child.kill();
			} catch {
				cleanupWarnings.push("process kill failed during cleanup");
			}
		}

		for (const warning of cleanupWarnings) {
			this.recordCleanupWarning(entry, warning);
		}
	}

	private formatStartupError(entry: ServerEntry, error: unknown): string {
		if (isMissingBinaryError(error)) {
			return `Failed to start LSP server "${entry.language}" because "${entry.config.command}" was not found. Install that binary or update your LSP config.`;
		}
		if (error instanceof RequestTimeoutError || error instanceof RequestCancelledError) {
			return error.message;
		}
		const message = error instanceof Error ? error.message : String(error);
		return `Failed to start LSP server "${entry.language}": ${message}${stderrSuffix(entry)}`;
	}

	private buildRequestParams(request: ExecuteLspRequest): Record<string, unknown> {
		const uri = toDocumentUri(request.filePath);
		if (request.operation === "documentSymbol") {
			return {
				textDocument: { uri },
			};
		}

		const position = toProtocolPosition({
			line: request.line ?? 1,
			column: request.column ?? 1,
		});

		if (request.operation === "findReferences") {
			return {
				textDocument: { uri },
				position,
				context: {
					includeDeclaration: request.includeDeclaration === true,
				},
			};
		}

		return {
			textDocument: { uri },
			position,
		};
	}

	private async syncDocument(entry: ServerEntry, filePath: string, text: string): Promise<void> {
		if (!entry.connection || !textDocumentSyncEnabled(entry.capabilities)) {
			return;
		}

		const uri = toDocumentUri(filePath);
		const existing = entry.openDocs.get(uri);
		if (!existing) {
			const state = createDocumentState(uri, filePath, entry.config.languageId, text);
			await this.sendNotification(
				entry,
				"textDocument/didOpen",
				{
					textDocument: {
						uri: state.uri,
						languageId: state.languageId,
						version: state.version,
						text: state.text,
					},
				},
				`Failed to sync ${filePath} with language server using textDocument/didOpen`,
			);
			entry.openDocs.set(uri, state);
			return;
		}

		const update = applyDocumentUpdate(existing, text);
		if (!update.changed) {
			return;
		}

		await this.sendNotification(
			entry,
			"textDocument/didChange",
			{
				textDocument: {
					uri,
					version: update.next.version,
				},
				contentChanges: [
					{
						text: update.next.text,
					},
				],
			},
			`Failed to sync ${filePath} with language server using textDocument/didChange`,
		);
		entry.openDocs.set(uri, update.next);
	}
}
