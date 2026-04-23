import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import { type BuddyTrace, classifyBuddyError, hashBuddyQuery } from "./diagnostics.ts";
import { BUDDY_STATE_TYPE, type BuddyConfig, resolveBuddyModel } from "./config.ts";
import { mr_kitty } from "./sprites.ts";

export interface BuddyState {
	name: string;
	bornAt: number;
	lastCommentAt: number;
	lastComment?: string;
	commentExpiresAt?: number;
	lastCommentSource?: "model" | "fallback";
}

export interface BuddyConversation {
	lastUserMessage: string;
	lastAssistantMessage: string;
	manualPrompt?: string;
}

export interface BuddyCommentResult {
	text?: string;
	source?: "model" | "fallback";
	warningKey?: string;
	warningMessage?: string;
	aborted?: boolean;
	trace: BuddyTrace;
}

type BuddyTraceBase = Pick<BuddyTrace, "requestId" | "modelKey" | "provider" | "startedAt" | "attemptedQueryHash">;

const BUDDY_SYSTEM_PROMPT = [
	"You are a tiny cat companion watching a coding conversation.",
	"Reply with one short aside.",
	"Keep it fun, concise, and natural.",
	"Dry, playful, or mildly catty is welcome.",
	"One line only.",
	"No markdown or speaker labels.",
].join("\n");

function createBuddyTrace(base: BuddyTraceBase, overrides: Omit<BuddyTrace, keyof BuddyTraceBase>): BuddyTrace {
	return { ...base, ...overrides };
}

function createFallbackBuddyResult(conversation: BuddyConversation, trace: BuddyTrace): BuddyCommentResult {
	return {
		text: pickFallback(conversation),
		source: "fallback",
		trace,
	};
}

const FALLBACK_QUIPS = [
	"That branch had claws.",
	"Readable code. Rare prey.",
	"I respect that patch.",
	"Bold move, keyboard human.",
	"Tiny diff. Big purr.",
	"That bug looked expensive.",
	"Elegant. Suspiciously elegant.",
	"Ship it. Carefully.",
	"I smelled that edge case.",
	"Nice save, opposable thumbs.",
	"That stack trace blinked first.",
	"The logs fear you now.",
] as const;

function hashString(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function pickFallback(conversation: BuddyConversation): string {
	const seed = `${conversation.lastUserMessage}\n${conversation.lastAssistantMessage}\n${conversation.manualPrompt || ""}\n${Date.now()}`;
	return FALLBACK_QUIPS[hashString(seed) % FALLBACK_QUIPS.length];
}

function trimContext(text: string, maxLength = 280): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function sanitizeGeneratedComment(text: string): string {
	let sanitized = text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)[0] ?? "";

	sanitized = sanitized.replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "");
	sanitized = sanitized.replace(/^[A-Za-z][A-Za-z0-9 _-]{0,24}:\s*/, "");
	sanitized = sanitized.replace(/\s+/g, " ").trim();

	if (sanitized.endsWith(".") && sanitized.split(" ").length <= 8) {
		sanitized = sanitized.slice(0, -1).trim();
	}

	if (sanitized.length > 72) {
		const truncated = sanitized.slice(0, 71).trimEnd();
		const boundary = truncated.lastIndexOf(" ");
		sanitized = `${(boundary >= 48 ? truncated.slice(0, boundary) : truncated).trimEnd()}…`;
	}

	return sanitized;
}

export function createInitialBuddyState(now = Date.now()): BuddyState {
	return {
		name: mr_kitty.name,
		bornAt: now,
		lastCommentAt: 0,
	};
}

function isBuddyState(data: unknown): data is BuddyState {
	if (!data || typeof data !== "object") return false;
	const state = data as Partial<BuddyState>;
	return (
		typeof state.name === "string" &&
		typeof state.bornAt === "number" &&
		Number.isFinite(state.bornAt) &&
		state.bornAt > 0 &&
		typeof state.lastCommentAt === "number" &&
		Number.isFinite(state.lastCommentAt) &&
		state.lastCommentAt >= 0
	);
}

export function restoreBuddyState(entries: readonly unknown[]): BuddyState | undefined {
	let restored: BuddyState | undefined;

	for (const entry of entries) {
		const maybeEntry = entry as { type?: string; customType?: string; data?: unknown };
		if (maybeEntry.type !== "custom" || maybeEntry.customType !== BUDDY_STATE_TYPE || !maybeEntry.data) continue;
		if (!isBuddyState(maybeEntry.data)) {
			console.warn("[buddy] Ignoring invalid persisted buddy state.");
			continue;
		}
		restored = { ...maybeEntry.data, name: mr_kitty.name };
	}

	return restored;
}

function extractTextFromContent(content: unknown): string {
	if (!Array.isArray(content)) return "";

	return content
		.filter(
			(block): block is { type: "text"; text: string } =>
				Boolean(block) && typeof block === "object" && (block as { type?: string }).type === "text" && typeof (block as { text?: unknown }).text === "string",
		)
		.map((block) => block.text)
		.join("\n")
		.trim();
}

export function extractBuddyConversation(entries: readonly unknown[]): BuddyConversation {
	let lastUserMessage = "";
	let lastAssistantMessage = "";

	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const entry = entries[index] as {
			type?: string;
			message?: { role?: string; content?: unknown };
		};

		if (entry.type !== "message" || !entry.message) continue;

		const text = extractTextFromContent(entry.message.content);
		if (!text) continue;

		if (!lastAssistantMessage && entry.message.role === "assistant") {
			lastAssistantMessage = text;
			continue;
		}

		if (!lastUserMessage && entry.message.role === "user") {
			lastUserMessage = text;
		}

		if (lastUserMessage && lastAssistantMessage) break;
	}

	return {
		lastUserMessage,
		lastAssistantMessage,
	};
}

export function shouldBuddySpeak(state: BuddyState, config: BuddyConfig, now = Date.now(), force = false): boolean {
	if (config.muted) return false;
	if (force) return true;
	if (now - state.lastCommentAt < config.cooldownMs) return false;
	return Math.random() < config.chance;
}

type BuddyCompleteFn = (
	model: unknown,
	context: {
		systemPrompt?: string;
		messages: Array<{
			role: string;
			content: Array<{ type: string; text: string }>;
			timestamp: number;
		}>;
	},
	options: {
		apiKey: string;
		headers?: Record<string, string>;
		maxTokens: number;
		signal?: AbortSignal;
	},
) => Promise<{ content: Array<{ type: string; text?: string }> }>;

export async function generateBuddyComment(
	ctx: ExtensionContext,
	config: BuddyConfig,
	conversation: BuddyConversation,
	requestId: string,
	deps: { completeFn?: BuddyCompleteFn; now?: () => number } = {},
): Promise<BuddyCommentResult> {
	const now = deps.now ?? Date.now;
	const startedAt = now();
	const selector = resolveBuddyModel(config.modelId);
	const modelKey = `${selector.provider}/${selector.id}`;
	const trimmedUser = trimContext(conversation.lastUserMessage || "No recent user message.");
	const trimmedAssistant = trimContext(conversation.lastAssistantMessage || "No recent assistant message.");
	const trimmedManualPrompt = conversation.manualPrompt ? trimContext(conversation.manualPrompt, 160) : undefined;
	const prompt = [
		"Drop a quick comment on this exchange.",
		trimmedManualPrompt ? `Direct nudge from the user: ${trimmedManualPrompt}` : undefined,
		`Last user message: ${trimmedUser}`,
		`Last assistant message: ${trimmedAssistant}`,
	]
		.filter(Boolean)
		.join("\n");
	const attemptedQueryHash = hashBuddyQuery(`${BUDDY_SYSTEM_PROMPT}\n---\n${prompt}`);

	const baseTrace = {
		requestId,
		modelKey,
		provider: selector.provider,
		startedAt,
		attemptedQueryHash,
	} satisfies BuddyTraceBase;

	const model = ctx.modelRegistry.find(selector.provider, selector.id);
	if (!model) {
		return {
			...createFallbackBuddyResult(
				conversation,
				createBuddyTrace(baseTrace, {
					durationMs: now() - startedAt,
					resultSource: "fallback",
					fallbackReason: "model-missing",
					completeEntered: false,
				}),
			),
			warningKey: "model-missing",
			warningMessage: `Buddy could not find ${selector.provider}/${selector.id}; using fallback quips instead.`,
		};
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		return {
			...createFallbackBuddyResult(
				conversation,
				createBuddyTrace(baseTrace, {
					durationMs: now() - startedAt,
					resultSource: "fallback",
					fallbackReason: "auth-error",
					httpErrorKind: "auth",
					errorMessage: auth.error,
					completeEntered: false,
				}),
			),
			warningKey: "auth-error",
			warningMessage: `Buddy could not authenticate ${selector.provider}/${selector.id}; using fallback quips instead (${auth.error}).`,
		};
	}

	if (!auth.apiKey) {
		return {
			...createFallbackBuddyResult(
				conversation,
				createBuddyTrace(baseTrace, {
					durationMs: now() - startedAt,
					resultSource: "fallback",
					fallbackReason: "missing-api-key",
					httpErrorKind: "auth",
					completeEntered: false,
				}),
			),
			warningKey: "missing-api-key",
			warningMessage: `Buddy could not find an API key for ${selector.provider}/${selector.id}; using fallback quips instead.`,
		};
	}

	const completeFn = deps.completeFn ?? (await import("@mariozechner/pi-ai")).complete;

	try {
		const response = await completeFn(
			model,
			{
				systemPrompt: BUDDY_SYSTEM_PROMPT,
				messages: [
					{
						role: "user",
						content: [{ type: "text", text: prompt }],
						timestamp: now(),
					},
				],
			},
			{
				apiKey: auth.apiKey,
				headers: auth.headers,
				maxTokens: 48,
				signal: ctx.signal ?? undefined,
			},
		);

		const text = sanitizeGeneratedComment(
			response.content
				.filter((block): block is { type: "text"; text: string } => block.type === "text")
				.map((block) => block.text)
				.join("\n"),
		);

		if (!text) {
			return {
				...createFallbackBuddyResult(
					conversation,
					createBuddyTrace(baseTrace, {
						durationMs: now() - startedAt,
						resultSource: "fallback",
						fallbackReason: "empty-response",
						httpErrorKind: "parse-empty-content",
						completeEntered: true,
					}),
				),
				warningKey: "empty-response",
				warningMessage: "Buddy got an empty model response; using fallback quips instead.",
			};
		}

		return {
			text,
			source: "model",
			trace: createBuddyTrace(baseTrace, {
				durationMs: now() - startedAt,
				resultSource: "model",
				completeEntered: true,
			}),
		};
	} catch (error) {
		if (error instanceof Error && error.name === "AbortError") {
			return {
				aborted: true,
				trace: createBuddyTrace(baseTrace, {
					durationMs: now() - startedAt,
					fallbackReason: "client-abort",
					httpErrorKind: "client-abort",
					errorMessage: error.message,
					completeEntered: true,
				}),
			};
		}
		const classified = classifyBuddyError(error);
		return {
			...createFallbackBuddyResult(
				conversation,
				createBuddyTrace(baseTrace, {
					durationMs: now() - startedAt,
					resultSource: "fallback",
					fallbackReason: "request-failed",
					httpErrorKind: classified.httpErrorKind,
					errorMessage: classified.errorMessage,
					completeEntered: true,
				}),
			),
			warningKey: "request-failed",
			warningMessage: `Buddy's model request failed; using fallback quips instead (${classified.errorMessage}).`,
		};
	}
}

export function applyBuddyComment(
	state: BuddyState,
	text: string,
	config: BuddyConfig,
	source: BuddyState["lastCommentSource"],
	now = Date.now(),
): BuddyState {
	return {
		...state,
		lastCommentAt: now,
		lastComment: text,
		commentExpiresAt: now + config.speechMs,
		lastCommentSource: source,
	};
}
