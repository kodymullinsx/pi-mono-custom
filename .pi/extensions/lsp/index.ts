import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import os from "node:os";
import path from "node:path";
import { loadConfig, resolveLanguageConfig, type ConfigLoadResult } from "./config.ts";
import {
	LspRuntime,
	filterIgnoredPaths,
	type ExecuteLspRequest,
	type LspOperation,
	type ServerStatusSnapshot,
} from "./runtime.ts";
import {
	analyzeLocations,
	renderDocumentSymbolResult,
	renderHoverResult,
	renderLocationResult,
	type FormattedDetails,
} from "./format.ts";

const runtime = new LspRuntime();

const PathSchema = Type.String({
	description: "File path. Relative paths resolve from the current working directory. Leading @ and ~ are allowed.",
});

const LSP_OPERATIONS = [
	"goToDefinition",
	"findReferences",
	"hover",
	"goToImplementation",
	"documentSymbol",
] as const;

const LanguageSchema = Type.Optional(
	Type.String({
		description: "Optional configured language key to force a specific server, for example 'typescript'.",
	}),
);

const LspParams = Type.Object({
	operation: Type.String({
		description: `Operation to run. Supported values: ${LSP_OPERATIONS.join(", ")}.`,
	}),
	path: PathSchema,
	line: Type.Optional(
		Type.Integer({
			minimum: 1,
			description:
				"1-based line number. Required for goToDefinition, findReferences, hover, and goToImplementation.",
		}),
	),
	column: Type.Optional(
		Type.Integer({
			minimum: 1,
			description:
				"1-based column number. Required for goToDefinition, findReferences, hover, and goToImplementation.",
		}),
	),
	language: LanguageSchema,
	includeDeclaration: Type.Optional(
		Type.Boolean({ description: "Only used for findReferences. Include the symbol declaration in reference results." }),
	),
});

function isLspOperation(value: unknown): value is LspOperation {
	return typeof value === "string" && LSP_OPERATIONS.includes(value as LspOperation);
}

function requiresPosition(operation: LspOperation): boolean {
	return operation !== "documentSymbol";
}

function resolveUserPath(inputPath: string, cwd: string): string {
	let normalizedPath = inputPath.trim();
	if (normalizedPath.startsWith("@")) {
		normalizedPath = normalizedPath.slice(1);
	}
	if (normalizedPath === "~") {
		normalizedPath = os.homedir();
	} else if (normalizedPath.startsWith("~/")) {
		normalizedPath = path.join(os.homedir(), normalizedPath.slice(2));
	}
	if (!path.isAbsolute(normalizedPath)) {
		normalizedPath = path.resolve(cwd, normalizedPath);
	}
	return path.resolve(normalizedPath);
}

function errorResult(message: string, details?: Record<string, unknown>) {
	return {
		content: [{ type: "text" as const, text: message }],
		details,
	};
}

function configSummary(configResult: ConfigLoadResult): string {
	if (configResult.loaded) {
		return `${configResult.loaded.sourceKind} (${configResult.loaded.sourcePath})`;
	}
	if (configResult.error) {
		return `error: ${configResult.error}`;
	}
	return "none";
}

function buildNoConfigMessage(configResult: ConfigLoadResult): string {
	const checked = configResult.checkedPaths.map((filePath) => `- ${filePath}`).join("\n");
	return `LSP is not configured for this project.\n\nChecked:\n${checked}`;
}

function buildStatusReport(configResult: ConfigLoadResult, entries: ServerStatusSnapshot[]): string {
	const lines = [
		`LSP status: ${configResult.error ? "failed" : "ready"}`,
		`Config: ${configSummary(configResult)}`,
	];

	if (!configResult.loaded && !configResult.error) {
		lines.push("", "Checked:");
		for (const checkedPath of configResult.checkedPaths) {
			lines.push(`- ${checkedPath}`);
		}
		return lines.join("\n");
	}

	if (configResult.error) {
		lines.push("", configResult.error);
	}

	if (entries.length === 0) {
		lines.push("", "No language servers have been started in this session.");
		return lines.join("\n");
	}

	lines.push("", "Servers:");
	for (const entry of entries) {
		lines.push(`- ${entry.language}: ${entry.state} pid=${entry.pid ?? "n/a"} openDocs=${entry.openDocuments}`);
		lines.push(`  root: ${entry.rootPath}`);
		if (entry.retryAt) {
			lines.push(`  retryAt: ${entry.retryAt}`);
		}
		if (entry.lastError) {
			lines.push(`  lastError: ${entry.lastError}`);
		}
		for (const warning of entry.cleanupWarnings ?? []) {
			lines.push(`  cleanupWarning: ${warning}`);
		}
	}
	return lines.join("\n");
}

function formatExecutionError(operation: LspOperation, error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return `LSP ${operation} failed: ${message}`;
}

async function renderResult(
	request: ExecuteLspRequest,
	rawResult: unknown,
): Promise<{ text: string; details: FormattedDetails }> {
	if (
		request.operation === "goToDefinition" ||
		request.operation === "findReferences" ||
		request.operation === "goToImplementation"
	) {
		const normalizedLocations = analyzeLocations(rawResult);
		const filtered = await filterIgnoredPaths(request.cwd, normalizedLocations.items);
		return renderLocationResult({
			operation: request.operation,
			language: request.language,
			sourcePath: request.filePath,
			locations: filtered.kept,
			filteredCount: filtered.filtered,
			filterAbandoned: filtered.filterAbandoned,
			filterWarning: filtered.filterWarning,
			malformedResultCount: normalizedLocations.malformedCount,
			unsupportedResponse: normalizedLocations.unsupportedResponse,
		});
	}

	if (request.operation === "hover") {
		return renderHoverResult({
			operation: request.operation,
			language: request.language,
			sourcePath: request.filePath,
			rawResult,
		});
	}

	return renderDocumentSymbolResult({
		operation: request.operation,
		language: request.language,
		sourcePath: request.filePath,
		rawResult,
	});
}

async function runLspTool(
	params: {
		operation: LspOperation;
		path: string;
		language?: string;
		line?: number;
		column?: number;
		includeDeclaration?: boolean;
	},
	ctx: ExtensionContext,
	signal?: AbortSignal,
) {
	try {
		const configResult = await loadConfig(ctx.cwd);
		if (configResult.error) {
			return errorResult(`LSP configuration error:\n\n${configResult.error}`, {
				operation: params.operation,
				error: configResult.error,
			});
		}
		if (!configResult.loaded) {
			return errorResult(buildNoConfigMessage(configResult), {
				operation: params.operation,
				error: "no_config",
				checkedPaths: configResult.checkedPaths,
			});
		}

		const filePath = resolveUserPath(params.path, ctx.cwd);
		const resolved = resolveLanguageConfig(configResult.loaded.config, filePath, params.language);
		const request: ExecuteLspRequest = {
			cwd: ctx.cwd,
			language: resolved.language,
			serverConfig: resolved.server,
			filePath,
			operation: params.operation,
			line: params.line,
			column: params.column,
			includeDeclaration: params.includeDeclaration,
			signal,
		};
		const runtimeResult = await runtime.execute(request);
		const rendered = await renderResult(request, runtimeResult.rawResult);
		return {
			content: [{ type: "text" as const, text: rendered.text }],
			details: {
				...rendered.details,
				configSource: configResult.loaded.sourcePath,
				server: runtimeResult.server,
			},
		};
	} catch (error) {
		const message = formatExecutionError(params.operation, error);
		return errorResult(message, {
			operation: params.operation,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

async function handleStatusCommand(ctx: ExtensionCommandContext): Promise<void> {
	const configResult = await loadConfig(ctx.cwd);
	const report = buildStatusReport(configResult, runtime.getStatusEntries());
	ctx.ui.notify(report, configResult.error ? "error" : "info");
}

export default function lspExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "lsp",
		label: "LSP",
		description:
			"Use configured Language Server Protocol servers for semantic navigation: goToDefinition, findReferences, hover, documentSymbol, and goToImplementation. Requires .pi/lsp.json or ~/.pi/agent/lsp.json.",
		parameters: LspParams,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!isLspOperation(params.operation)) {
				return errorResult(
					`Invalid LSP operation \"${String(params.operation)}\". Supported values: ${LSP_OPERATIONS.join(", ")}.`,
					{ error: "invalid_operation", operation: params.operation },
				);
			}

			if (requiresPosition(params.operation) && (params.line === undefined || params.column === undefined)) {
				return errorResult(
					`LSP ${params.operation} requires both line and column.`,
					{ error: "missing_position", operation: params.operation },
				);
			}

			return runLspTool(params, ctx, signal);
		},
	});

	pi.registerCommand("lsp-status", {
		description: "Show LSP extension status, active servers, and the config source.",
		handler: async (_args, ctx) => {
			await handleStatusCommand(ctx);
		},
	});

	const resetRuntime = async () => {
		await runtime.reset();
	};

	pi.on("session_start", async () => {
		await resetRuntime();
	});

	pi.on("session_shutdown", async () => {
		await runtime.reset();
	});
}
