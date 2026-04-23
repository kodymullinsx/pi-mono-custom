import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
export const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;

export type ConfigSourceKind = "project" | "global";

export interface LspServerConfig {
	command: string;
	args: string[];
	extensions: string[];
	languageId: string;
	rootUri?: string | null;
	initializationOptions?: unknown;
	startupTimeoutMs: number;
	requestTimeoutMs: number;
}

export interface LspConfig {
	servers: Record<string, LspServerConfig>;
}

export interface LoadedConfig {
	config: LspConfig;
	sourceKind: ConfigSourceKind;
	sourcePath: string;
}

export interface ConfigLoadResult {
	loaded?: LoadedConfig;
	error?: string;
	checkedPaths: string[];
}

export interface ResolvedLanguageConfig {
	language: string;
	server: LspServerConfig;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeExtension(value: string): string {
	const trimmed = value.trim().toLowerCase();
	if (!trimmed) {
		return trimmed;
	}
	return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function validatePositiveInteger(value: unknown, fieldPath: string, fallback: number): number {
	if (value === undefined) {
		return fallback;
	}
	if (!Number.isInteger(value) || Number(value) <= 0) {
		throw new Error(`${fieldPath} must be a positive integer`);
	}
	return Number(value);
}

function validateServerConfig(languageKey: string, raw: unknown): LspServerConfig {
	if (!isRecord(raw)) {
		throw new Error(`servers.${languageKey} must be an object`);
	}

	const command = raw.command;
	if (typeof command !== "string" || command.trim() === "") {
		throw new Error(`servers.${languageKey}.command must be a non-empty string`);
	}

	const args = raw.args;
	if (!Array.isArray(args) || !args.every((item) => typeof item === "string")) {
		throw new Error(`servers.${languageKey}.args must be an array of strings`);
	}

	const extensions = raw.extensions;
	if (!Array.isArray(extensions) || extensions.length === 0 || !extensions.every((item) => typeof item === "string")) {
		throw new Error(`servers.${languageKey}.extensions must be a non-empty array of strings`);
	}
	if (extensions.some((item) => normalizeExtension(item) === "")) {
		throw new Error(`servers.${languageKey}.extensions cannot contain empty strings`);
	}

	const languageId = raw.languageId;
	if (typeof languageId !== "string" || languageId.trim() === "") {
		throw new Error(`servers.${languageKey}.languageId must be a non-empty string`);
	}

	const rootUri = raw.rootUri;
	if (rootUri !== undefined && rootUri !== null && (typeof rootUri !== "string" || rootUri.trim() === "")) {
		throw new Error(`servers.${languageKey}.rootUri must be null or a non-empty string`);
	}

	return {
		command: command.trim(),
		args,
		extensions: extensions.map((extension) => normalizeExtension(extension)),
		languageId: languageId.trim(),
		rootUri: rootUri === undefined ? undefined : rootUri,
		initializationOptions: raw.initializationOptions ?? {},
		startupTimeoutMs: validatePositiveInteger(
			raw.startupTimeoutMs,
			`servers.${languageKey}.startupTimeoutMs`,
			DEFAULT_STARTUP_TIMEOUT_MS,
		),
		requestTimeoutMs: validatePositiveInteger(
			raw.requestTimeoutMs,
			`servers.${languageKey}.requestTimeoutMs`,
			DEFAULT_REQUEST_TIMEOUT_MS,
		),
	};
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code === "ENOENT") {
			return false;
		}
		throw new Error(`Cannot access LSP config path ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function readConfigFile(filePath: string, sourceKind: ConfigSourceKind): Promise<LoadedConfig> {
	let parsed: unknown;
	try {
		const text = await fs.readFile(filePath, "utf8");
		parsed = JSON.parse(text);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Unable to read ${sourceKind} LSP config at ${filePath}: ${message}`);
	}

	if (!isRecord(parsed)) {
		throw new Error(`LSP config at ${filePath} must be a JSON object`);
	}

	if (!isRecord(parsed.servers)) {
		throw new Error(`LSP config at ${filePath} must contain a "servers" object`);
	}

	const entries = Object.entries(parsed.servers);
	if (entries.length === 0) {
		throw new Error(`LSP config at ${filePath} must define at least one server`);
	}

	const servers: Record<string, LspServerConfig> = {};
	for (const [rawLanguage, rawServer] of entries) {
		const language = rawLanguage.trim().toLowerCase();
		if (!language) {
			throw new Error(`LSP config at ${filePath} contains an empty language key`);
		}
		if (servers[language]) {
			throw new Error(`LSP config at ${filePath} contains duplicate language key "${language}"`);
		}
		servers[language] = validateServerConfig(language, rawServer);
	}

	return {
		config: { servers },
		sourceKind,
		sourcePath: filePath,
	};
}

async function loadConfigFromPath(
	filePath: string,
	sourceKind: ConfigSourceKind,
	checkedPaths: string[],
): Promise<ConfigLoadResult | undefined> {
	if (!(await fileExists(filePath))) {
		return undefined;
	}

	try {
		return { loaded: await readConfigFile(filePath, sourceKind), checkedPaths };
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
			checkedPaths,
		};
	}
}

export function getAgentDir(env: NodeJS.ProcessEnv = process.env): string {
	const explicit = env.PI_CODING_AGENT_DIR ?? env.TAU_CODING_AGENT_DIR;
	if (explicit) {
		if (explicit === "~") {
			return os.homedir();
		}
		if (explicit.startsWith("~/")) {
			return path.join(os.homedir(), explicit.slice(2));
		}
		return explicit;
	}

	for (const [key, value] of Object.entries(env)) {
		if (key.endsWith("_CODING_AGENT_DIR") && value) {
			return value === "~" ? os.homedir() : value.startsWith("~/") ? path.join(os.homedir(), value.slice(2)) : value;
		}
	}

	return path.join(os.homedir(), ".pi", "agent");
}

export function getProjectConfigPath(cwd: string): string {
	return path.join(path.resolve(cwd), ".pi", "lsp.json");
}

export function getGlobalConfigPath(agentDir = getAgentDir()): string {
	return path.join(agentDir, "lsp.json");
}

export async function loadConfig(cwd: string, options: { agentDir?: string } = {}): Promise<ConfigLoadResult> {
	const projectPath = getProjectConfigPath(cwd);
	const globalPath = getGlobalConfigPath(options.agentDir);
	const checkedPaths = [projectPath, globalPath];

	try {
		const projectConfig = await loadConfigFromPath(projectPath, "project", checkedPaths);
		if (projectConfig) {
			return projectConfig;
		}

		const globalConfig = await loadConfigFromPath(globalPath, "global", checkedPaths);
		if (globalConfig) {
			return globalConfig;
		}
	} catch (error) {
		return {
			error: error instanceof Error ? error.message : String(error),
			checkedPaths,
		};
	}

	return { checkedPaths };
}

export function resolveLanguageConfig(
	config: LspConfig,
	filePath: string,
	explicitLanguage?: string,
): ResolvedLanguageConfig {
	if (explicitLanguage) {
		const language = explicitLanguage.trim().toLowerCase();
		const server = config.servers[language];
		if (!server) {
			throw new Error(
				`No LSP server is configured for language "${explicitLanguage}". Available languages: ${Object.keys(config.servers).join(", ")}`,
			);
		}
		return { language, server };
	}

	const extension = path.extname(filePath).toLowerCase();
	if (!extension) {
		throw new Error(`Cannot infer a language server for ${filePath} because the file has no extension`);
	}

	for (const [language, server] of Object.entries(config.servers)) {
		if (server.extensions.includes(extension)) {
			return { language, server };
		}
	}

	const supported = Object.entries(config.servers)
		.map(([language, server]) => `${language} (${server.extensions.join(", ")})`)
		.join("; ");
	throw new Error(`No configured LSP server handles ${extension}. Supported mappings: ${supported}`);
}
