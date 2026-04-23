/**
 * Domain Memory Extension
 *
 * Equivalent to Claude's domain_memory.py (UserPromptSubmit hook) and
 * memory_index_regen.py (PostToolUse hook).
 *
 * - Uses CWD to choose memory tree on each prompt
 * - `~/work/*` -> inject work index only
 * - all other paths -> attempt semantic routing against `~/projects/Memory/`
 * - on confident match -> inject matched `memory.md` + scoped `_index.md`
 * - on router failure or no match -> inject scoped `_index.md` only
 * - Regenerates `_index.md` when a `memory.md` is written or edited
 */

import { readFileSync, writeFileSync, existsSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { generateMemoryIndex } from "../../lib/memory-schema/index.ts";
import { shouldBypassAttachmentRouting } from "./routing-helpers.ts";

const HOME = homedir();
const INSTALL_HOME = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../");
const PROJECTS_MEMORY_ROOT = join(HOME, "projects", "Memory");
const WORK_MEMORY_ROOT = join(HOME, "work", "Memory");
const PROJECTS_INDEX = join(PROJECTS_MEMORY_ROOT, "_index.md");
const WORK_INDEX = join(WORK_MEMORY_ROOT, "_index.md");
const G1_PATTERNS_RELATIVE_PATH = join("benchmark-memory", "src", "intent_gate", "g1_negative_patterns.json");
const G1_PATTERNS_OVERRIDE_PATH = process.env.DOMAIN_MEMORY__g1_patterns_path;

function resolveFirstExistingPath(candidates: Array<string | undefined>): string | undefined {
	for (const candidate of candidates) {
		if (candidate && existsSync(candidate)) return candidate;
	}
	return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0);
}

const G1_PATTERNS_PATH = G1_PATTERNS_OVERRIDE_PATH
	? G1_PATTERNS_OVERRIDE_PATH
	: resolveFirstExistingPath([
			join(HOME, "Projects", G1_PATTERNS_RELATIVE_PATH),
			join(HOME, "projects", G1_PATTERNS_RELATIVE_PATH),
			join(INSTALL_HOME, "Projects", G1_PATTERNS_RELATIVE_PATH),
			join(INSTALL_HOME, "projects", G1_PATTERNS_RELATIVE_PATH),
		]);

const ROUTE_URL = process.env.DOMAIN_MEMORY__route_url ?? "http://127.0.0.1:18432/route";
const SERVER_TIMEOUT_MS = 2000;
const TOKEN_CAP = 2000;
const WORDS_PER_TOKEN = 0.75;
const INDEX_TRUNCATED_MARKER = "[domain-memory: index-truncated]";

type Scope = "personal" | "work";

type RouteResponse = {
	matched: boolean;
	domain_id: string | null;
	path: string | null;
	confidence: number;
	threshold: number;
	query_variant: string;
	backend: string;
	model: string;
	reason: string;
};

type FileReadResult = {
	content: string;
	errorReason: "missing" | "unreadable" | "empty" | null;
};

type IndexRegenerationResult =
	| { status: "skipped" | "updated" | "unchanged" }
	| { status: "failed"; message: string };

const reportedG1DegradedSessions = new Set<string>();
const reportedAttachmentBypassSessions = new Set<string>();

function logWithLevel(level: "warn" | "error", message: string, error?: unknown): void {
	const ts = new Date().toISOString();
	const formatted = `${ts} [domain-memory] [${level}] ${message}`;
	if (error === undefined) {
		if (level === "error") {
			console.error(formatted);
			return;
		}
		console.warn(formatted);
		return;
	}
	if (level === "error") {
		console.error(formatted, error);
		return;
	}
	console.warn(formatted, error);
}

function logWarning(message: string, error?: unknown): void {
	logWithLevel("warn", message, error);
}

function logError(message: string, error?: unknown): void {
	logWithLevel("error", message, error);
}

function loadG1NegativePatterns(): { patterns: RegExp[]; errorReason: string | null } {
	if (!G1_PATTERNS_PATH) {
		logError("shared G1 patterns path could not be resolved; semantic routing will fail open without the intent gate");
		return { patterns: [], errorReason: "g1-unavailable" };
	}
	if (G1_PATTERNS_OVERRIDE_PATH && !existsSync(G1_PATTERNS_PATH)) {
		logError(
			`configured DOMAIN_MEMORY__g1_patterns_path does not exist at ${G1_PATTERNS_PATH}; semantic routing will fail open without the intent gate`,
		);
		return { patterns: [], errorReason: "g1-unavailable" };
	}

	let payload: unknown;
	try {
		payload = JSON.parse(readFileSync(G1_PATTERNS_PATH, "utf-8"));
	} catch (error) {
		logError(
			`failed to load shared G1 patterns from ${G1_PATTERNS_PATH}; semantic routing will fail open without the intent gate`,
			error,
		);
		return { patterns: [], errorReason: "g1-unavailable" };
	}
	if (!Array.isArray(payload) || payload.some((item) => typeof item !== "string" || item.length === 0)) {
		logError(`invalid shared G1 patterns at ${G1_PATTERNS_PATH}; semantic routing will fail open without the intent gate`);
		return { patterns: [], errorReason: "g1-unavailable" };
	}
	try {
		return { patterns: payload.map((pattern) => new RegExp(pattern, "i")), errorReason: null };
	} catch (error) {
		logError(
			`failed to compile shared G1 patterns from ${G1_PATTERNS_PATH}; semantic routing will fail open without the intent gate`,
			error,
		);
		return { patterns: [], errorReason: "g1-unavailable" };
	}
}

// --- Intent Gate G1 (inline) ---
// Blocks router call when query shows strong general-knowledge / generation intent.
// Canonical source: benchmark-memory/src/intent_gate/g1_negative_patterns.json
const { patterns: _G1_NEGATIVE, errorReason: G1_LOAD_ERROR } = loadG1NegativePatterns();

/**
 * Return whether the query should proceed to memory retrieval.
 */
function checkIntentGateG1(query: string): { shouldRoute: boolean; errorReason: string | null } {
	if (G1_LOAD_ERROR) {
		return { shouldRoute: true, errorReason: G1_LOAD_ERROR };
	}
	return { shouldRoute: !_G1_NEGATIVE.some((pat) => pat.test(query)), errorReason: null };
}

function reportDomainMemoryMessage(
	ctx: { hasUI?: boolean; ui?: { notify: (message: string, level: "info" | "warning" | "error") => void } },
	message: string,
	level: "warning" | "error",
): void {
	if (ctx.hasUI && ctx.ui) {
		ctx.ui.notify(message, level);
		return;
	}
	if (level === "error") {
		logError(message);
		return;
	}
	logWarning(message);
}

function getSessionNoticeKey(ctx: ExtensionContext): string {
	const sessionFile = ctx.sessionManager?.getSessionFile?.();
	if (typeof sessionFile === "string" && sessionFile.length > 0) return sessionFile;
	const sessionId = ctx.sessionManager?.getSessionId?.();
	if (typeof sessionId === "string" && sessionId.length > 0) return sessionId;
	return `${ctx.cwd}:headless`;
}

function reportG1DegradedModeOnce(ctx: ExtensionContext): void {
	if (!G1_LOAD_ERROR) return;
	const key = getSessionNoticeKey(ctx);
	if (reportedG1DegradedSessions.has(key)) return;
	reportedG1DegradedSessions.add(key);
	reportDomainMemoryMessage(
		ctx,
		"Domain memory intent gate is unavailable, so semantic routing is running in fail-open mode for this session.",
		"warning",
	);
}

function reportAttachmentBypassOnce(ctx: ExtensionContext): void {
	const key = getSessionNoticeKey(ctx);
	if (reportedAttachmentBypassSessions.has(key)) return;
	reportedAttachmentBypassSessions.add(key);
	reportDomainMemoryMessage(
		ctx,
		"Domain memory semantic routing was bypassed for this attachment-heavy turn, so only the memory index was injected.",
		"warning",
	);
}

function readFileWithStatus(filePath: string, maxLines?: number): FileReadResult {
	if (!existsSync(filePath)) return { content: "", errorReason: "missing" };
	let lines: string[];
	try {
		lines = readFileSync(filePath, "utf-8").split("\n");
	} catch (error) {
		logWarning(`failed to read file ${filePath}`, error);
		return { content: "", errorReason: "unreadable" };
	}
	const content = maxLines == null ? lines.join("\n") : lines.slice(0, maxLines).join("\n");
	return { content, errorReason: content.length === 0 ? "empty" : null };
}

function normalizePath(filePath: string): string {
	try {
		return realpathSync.native(filePath).toLowerCase();
	} catch {
		return resolve(filePath).toLowerCase();
	}
}

function countTokensApprox(text: string): number {
	return Math.floor(text.split(/\s+/).filter(Boolean).length / WORDS_PER_TOKEN);
}

function trimIndexToBudget(indexContent: string, remainingTokens: number): string {
	if (remainingTokens <= 0) return "";
	if (countTokensApprox(indexContent) <= remainingTokens) return indexContent;

	const lines = indexContent.split("\n");
	while (lines.length > 0) {
		const candidate = lines.join("\n").trimEnd();
		const withMarker = candidate ? `${candidate}\n\n${INDEX_TRUNCATED_MARKER}` : INDEX_TRUNCATED_MARKER;
		if (countTokensApprox(withMarker) <= remainingTokens) {
			return withMarker;
		}
		lines.pop();
	}

	return countTokensApprox(INDEX_TRUNCATED_MARKER) <= remainingTokens ? INDEX_TRUNCATED_MARKER : "";
}

function renderContext(header: string, domainContent: string | null, indexContent: string): string {
	const base = domainContent ? `${header}\n\n${domainContent}` : header;
	if (!indexContent) return base;

	const full = `${base}\n\n${indexContent}`;
	if (countTokensApprox(full) <= TOKEN_CAP) return full;

	const remainingTokens = TOKEN_CAP - countTokensApprox(base);
	const trimmedIndex = trimIndexToBudget(indexContent, remainingTokens);
	return trimmedIndex ? `${base}\n\n${trimmedIndex}` : base;
}

function getScopeInfo(scope: Scope): {
	memoryRoot: string;
	indexPath: string;
	rootLabel: string;
	scopeLabel: string;
} {
	return scope === "work"
		? {
				memoryRoot: WORK_MEMORY_ROOT,
				indexPath: WORK_INDEX,
				rootLabel: "~/work/Memory",
				scopeLabel: "work",
			}
		: {
				memoryRoot: PROJECTS_MEMORY_ROOT,
				indexPath: PROJECTS_INDEX,
				rootLabel: "~/projects/Memory",
				scopeLabel: "personal + projects",
			};
}

async function buildScopeIndexOnlyContext(scope: Scope, reason: string): Promise<string> {
	const { indexPath, rootLabel, scopeLabel } = getScopeInfo(scope);
	const indexRead = readFileWithStatus(indexPath);
	if (indexRead.errorReason) {
		const unavailableReason =
			indexRead.errorReason === "missing"
				? "index-missing"
				: indexRead.errorReason === "empty"
					? "index-empty"
					: "index-unreadable";
		return buildUnavailableContext(scopeLabel, rootLabel, unavailableReason);
	}
	return buildIndexOnlyContext(scopeLabel, rootLabel, indexRead.content, reason);
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function invalidRouteResponse(diagnostic: string): { result: RouteResponse | null; errorReason: string | null; diagnostic: string } {
	return { result: null, errorReason: "invalid-response", diagnostic };
}

function parseRouteResponse(
	payload: unknown,
): { result: RouteResponse | null; errorReason: string | null; diagnostic?: string } {
	if (typeof payload !== "object" || payload === null) {
		return invalidRouteResponse("payload was not an object");
	}

	const value = payload as Record<string, unknown>;
	const requiredFields = ["matched", "confidence", "threshold", "query_variant", "backend", "model", "reason"];
	for (const field of requiredFields) {
		if (!(field in value)) {
			return invalidRouteResponse(`missing required field ${field}`);
		}
	}

	if (typeof value.matched !== "boolean") {
		return invalidRouteResponse("matched was not a boolean");
	}
	if (!isNumber(value.confidence) || !isNumber(value.threshold)) {
		return invalidRouteResponse("confidence or threshold was not numeric");
	}
	if (typeof value.query_variant !== "string" || !value.query_variant) {
		return invalidRouteResponse("query_variant was empty or not a string");
	}
	if (typeof value.backend !== "string" || !value.backend) {
		return invalidRouteResponse("backend was empty or not a string");
	}
	if (typeof value.model !== "string" || !value.model) {
		return invalidRouteResponse("model was empty or not a string");
	}
	if (typeof value.reason !== "string" || !value.reason) {
		return invalidRouteResponse("reason was empty or not a string");
	}

	if (value.matched) {
		if (typeof value.domain_id !== "string" || !value.domain_id) {
			return invalidRouteResponse("matched response was missing domain_id");
		}
		if (typeof value.path !== "string" || !value.path) {
			return invalidRouteResponse("matched response was missing path");
		}
	} else if (value.domain_id != null || value.path != null) {
		return invalidRouteResponse("unmatched response included domain_id or path");
	}

	return {
		result: {
			matched: value.matched,
			domain_id: (value.domain_id as string | null) ?? null,
			path: (value.path as string | null) ?? null,
			confidence: value.confidence,
			threshold: value.threshold,
			query_variant: value.query_variant,
			backend: value.backend,
			model: value.model,
			reason: value.reason,
		},
		errorReason: null,
	};
}

async function callRouter(
	query: string,
	scope: Scope,
	signal?: AbortSignal,
): Promise<{ result: RouteResponse | null; errorReason: string | null }> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);
	const combinedSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
	try {
		const resp = await fetch(ROUTE_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ query, scope }),
			signal: combinedSignal,
		});
		if (!resp.ok) {
			logWarning(`router HTTP error scope=${scope} url=${ROUTE_URL} status=${resp.status}`);
			return { result: null, errorReason: "http-error" };
		}
		let payload: unknown;
		try {
			payload = await resp.json();
		} catch (error) {
			logWarning(`router returned invalid JSON scope=${scope} url=${ROUTE_URL}`, error);
			return { result: null, errorReason: "invalid-response" };
		}
		const parsed = parseRouteResponse(payload);
		if (parsed.errorReason === "invalid-response") {
			logWarning(`router returned invalid response scope=${scope} url=${ROUTE_URL}: ${parsed.diagnostic ?? "unknown shape"}`);
		}
		return { result: parsed.result, errorReason: parsed.errorReason };
	} catch (error) {
		if (signal?.aborted) {
			logWarning(`router request aborted by caller scope=${scope} url=${ROUTE_URL}`);
			return { result: null, errorReason: "aborted" };
		}
		if (controller.signal.aborted) {
			logWarning(`router request timed out scope=${scope} url=${ROUTE_URL}`);
			return { result: null, errorReason: "timeout" };
		}
		logWarning(`router request failed scope=${scope} url=${ROUTE_URL}`, error);
		return { result: null, errorReason: "network-error" };
	} finally {
		clearTimeout(timer);
	}
}

function isAllowedDomain(scope: Scope, domainId: string): boolean {
	if (scope === "work") return domainId === "work" || domainId.startsWith("work/");
	return (
		domainId === "personal" ||
		domainId.startsWith("personal/") ||
		domainId === "projects" ||
		domainId.startsWith("projects/")
	);
}

function resolveDomainMemoryPath(memoryRoot: string, domainId: string, relativePath?: string | null): string {
	if (relativePath) return resolve(memoryRoot, relativePath);
	if (domainId === "work") return resolve(memoryRoot, "memory.md");
	return resolve(memoryRoot, domainId, "memory.md");
}

function isWithinRoot(rootPath: string, targetPath: string): boolean {
	const normalizedRoot = normalizePath(rootPath);
	const normalizedTarget = normalizePath(targetPath);
	return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

function buildIndexOnlyContext(scopeLabel: string, rootLabel: string, indexContent: string, reason: string): string {
	const header =
		`[domain-memory: index-fallback reason=${reason}]\n` +
		`Domain memory available (${scopeLabel}). Root: ${rootLabel}`;
	return renderContext(header, null, indexContent);
}

function buildUnavailableContext(scopeLabel: string, rootLabel: string, reason: string): string {
	return (
		`[domain-memory: unavailable reason=${reason}]\n` +
		`Domain memory unavailable (${scopeLabel}). Root: ${rootLabel}`
	);
}

function buildMatchedContext(scopeLabel: string, rootLabel: string, result: RouteResponse, domainContent: string, indexContent: string): string {
	const header =
		`[domain-memory: matched-injected domain_id=${result.domain_id}]\n` +
		`Domain memory (${scopeLabel}). Root: ${rootLabel}\n` +
		`Semantic match: ${result.domain_id} ` +
		`(confidence: ${result.confidence.toFixed(3)}, backend: ${result.backend}, model: ${result.model})`;
	return renderContext(header, domainContent, indexContent);
}

async function buildScopedContext(prompt: string, scope: Scope, signal?: AbortSignal): Promise<string> {
	const { memoryRoot, indexPath, rootLabel, scopeLabel } = getScopeInfo(scope);
	const indexRead = readFileWithStatus(indexPath);
	if (indexRead.errorReason) {
		const reason =
			indexRead.errorReason === "missing"
				? "index-missing"
				: indexRead.errorReason === "empty"
					? "index-empty"
					: "index-unreadable";
		return buildUnavailableContext(scopeLabel, rootLabel, reason);
	}
	const indexContent = indexRead.content;

	if (scope === "work") {
		return buildIndexOnlyContext(scopeLabel, rootLabel, indexContent, "work-bypass");
	}
	if (!prompt) {
		return buildIndexOnlyContext(scopeLabel, rootLabel, indexContent, "no-prompt");
	}
	const gateDecision = checkIntentGateG1(prompt);
	if (!gateDecision.shouldRoute) {
		return buildIndexOnlyContext(scopeLabel, rootLabel, indexContent, "gate-blocked");
	}

	const { result, errorReason } = await callRouter(prompt, scope, signal);
	if (errorReason) {
		return buildIndexOnlyContext(scopeLabel, rootLabel, indexContent, errorReason);
	}
	if (!result || !result.matched) {
		return buildIndexOnlyContext(scopeLabel, rootLabel, indexContent, "no-match");
	}
	if (!isAllowedDomain(scope, result.domain_id ?? "")) {
		logWarning(
			`router returned disallowed domain scope=${scope} domain_id=${result.domain_id ?? "null"} path=${result.path ?? "null"}`,
		);
		return buildIndexOnlyContext(scopeLabel, rootLabel, indexContent, "unsafe-path");
	}

	const domainPath = resolveDomainMemoryPath(memoryRoot, result.domain_id ?? "", result.path);
	if (!isWithinRoot(memoryRoot, domainPath)) {
		logWarning(
			`router resolved path outside memory root scope=${scope} domain_id=${result.domain_id ?? "null"} returnedPath=${result.path ?? "null"} resolvedPath=${domainPath}`,
		);
		return buildIndexOnlyContext(scopeLabel, rootLabel, indexContent, "unsafe-path");
	}

	const domainRead = readFileWithStatus(domainPath, 100);
	if (domainRead.errorReason) {
		logWarning(
			`router matched domain content that could not be loaded scope=${scope} domain_id=${result.domain_id ?? "null"} path=${domainPath} reason=${domainRead.errorReason}`,
		);
		const reason =
			domainRead.errorReason === "missing"
				? "domain-missing"
				: domainRead.errorReason === "empty"
					? "domain-empty"
					: "domain-unreadable";
		return buildIndexOnlyContext(scopeLabel, rootLabel, indexContent, reason);
	}

	return buildMatchedContext(scopeLabel, rootLabel, result, domainRead.content, indexContent);
}

// --- Shared index regeneration ---

function regenIndexIfNeeded(filePath: string): IndexRegenerationResult {
	if (!filePath.endsWith("/memory.md")) return { status: "skipped" };
	for (const root of [PROJECTS_MEMORY_ROOT, WORK_MEMORY_ROOT]) {
		if (!isWithinRoot(root, filePath)) continue;
		const indexPath = join(root, "_index.md");
		let newContent: string;
		try {
			newContent = generateMemoryIndex(root);
		} catch (error) {
			const message = `Domain memory updated, but failed to regenerate ${indexPath}.`;
			logError(message, error);
			return { status: "failed", message };
		}
		try {
			if (existsSync(indexPath) && readFileSync(indexPath, "utf-8") === newContent) {
				return { status: "unchanged" };
			}
		} catch (error) {
			logWarning("Failed to read existing index, regenerating anyway", error);
		}
		try {
			writeFileSync(indexPath, newContent, "utf-8");
			return { status: "updated" };
		} catch (error) {
			const message = `Domain memory updated, but failed to regenerate ${indexPath}.`;
			logError(message, error);
			return { status: "failed", message };
		}
	}
	return { status: "skipped" };
}

// --- Extension entry point ---

export default function domainMemoryExtension(pi: ExtensionAPI): void {
	pi.on("before_agent_start", async (event, ctx) => {
		const cwd = ctx.cwd;
		let context = "";
		const prompt = event.prompt ?? "";
		const bypassAttachmentRouting = shouldBypassAttachmentRouting({
			prompt,
			cwd,
			attachments: event.attachments,
		});

		if (isWithinRoot(join(HOME, "work"), cwd)) {
			context = await buildScopedContext(prompt, "work", ctx.signal);
		} else {
			reportG1DegradedModeOnce(ctx);
			if (bypassAttachmentRouting) {
				reportAttachmentBypassOnce(ctx);
			}
			context = bypassAttachmentRouting
				? await buildScopeIndexOnlyContext("personal", "attachment-bypass")
				: await buildScopedContext(prompt, "personal", ctx.signal);
		}

		if (!context) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${context}` };
	});

	pi.on("tool_result", (event: ToolResultEvent, ctx: ExtensionContext) => {
		const toolName = (event as unknown as { toolName: string }).toolName;
		if (toolName !== "write" && toolName !== "edit") return;
		if ((event as unknown as { isError?: boolean }).isError) return;
		const input = (event as unknown as { input?: { path?: string } }).input;
		const p = input?.path;
		if (!p) return;
		const regenResult = regenIndexIfNeeded(resolve(ctx.cwd, p));
		if (regenResult.status === "failed") {
			reportDomainMemoryMessage(ctx, regenResult.message, "warning");
		}
	});
}
