import assert from "node:assert/strict";
import test from "node:test";

import { generateBuddyComment, sanitizeGeneratedComment } from "../companion.ts";
import { classifyBuddyError, isBuddyTrace, persistBuddyTraceEntry } from "../diagnostics.ts";
import { BUDDY_TRACE_TYPE, type BuddyConfig } from "../config.ts";

const baseConfig: BuddyConfig = {
	chance: 0.2,
	muted: false,
	modelId: "deepinfra/test-model",
	cooldownMs: 30_000,
	speechMs: 10_000,
	tickMs: 500,
	traceEnabled: false,
};

const traceEnabledConfig: BuddyConfig = { ...baseConfig, traceEnabled: true };

const baseConversation = {
	lastUserMessage: "Please review this patch.",
	lastAssistantMessage: "The patch looks good overall.",
	manualPrompt: "Be extra catty",
};

function makeNow(...values: number[]): () => number {
	let index = 0;
	return () => {
		const current = values[Math.min(index, values.length - 1)] ?? values[values.length - 1] ?? 0;
		index += 1;
		return current;
	};
}

function makeCtx(overrides: Partial<any> = {}): any {
	return {
		modelRegistry: {
			find: () => ({ id: "test-model", provider: "deepinfra" }),
			getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "secret", headers: { authorization: "Bearer secret" } }),
		},
		signal: undefined,
		...overrides,
	};
}

test("generateBuddyComment records model-missing fallback traces before complete runs", async () => {
	const ctx = makeCtx({
		modelRegistry: {
			find: () => undefined,
			getApiKeyAndHeaders: async () => {
				throw new Error("should not run");
			},
		},
	});

	const result = await generateBuddyComment(ctx, baseConfig, baseConversation, "req-model-missing", {
		now: makeNow(1_000, 1_025),
	});

	assert.equal(result.source, "fallback");
	assert.equal(result.warningKey, "model-missing");
	assert.equal(result.trace.requestId, "req-model-missing");
	assert.equal(result.trace.modelKey, "deepinfra/test-model");
	assert.equal(result.trace.provider, "deepinfra");
	assert.equal(result.trace.startedAt, 1_000);
	assert.equal(result.trace.durationMs, 25);
	assert.equal(result.trace.completeEntered, false);
	assert.equal(result.trace.resultSource, "fallback");
	assert.equal(result.trace.fallbackReason, "model-missing");
	assert.equal(result.trace.attemptedQueryHash.length, 16);
});

test("generateBuddyComment records auth-error fallback traces before complete runs", async () => {
	const ctx = makeCtx({
		modelRegistry: {
			find: () => ({ id: "test-model", provider: "deepinfra" }),
			getApiKeyAndHeaders: async () => ({ ok: false, error: "invalid token" }),
		},
	});

	const result = await generateBuddyComment(ctx, baseConfig, baseConversation, "req-auth-error", {
		now: makeNow(2_000, 2_040),
	});

	assert.equal(result.source, "fallback");
	assert.equal(result.warningKey, "auth-error");
	assert.equal(result.trace.completeEntered, false);
	assert.equal(result.trace.fallbackReason, "auth-error");
	assert.equal(result.trace.httpErrorKind, "auth");
	assert.equal(result.trace.errorMessage, "invalid token");
});

test("generateBuddyComment records missing-api-key fallback traces before complete runs", async () => {
	const ctx = makeCtx({
		modelRegistry: {
			find: () => ({ id: "test-model", provider: "deepinfra" }),
			getApiKeyAndHeaders: async () => ({ ok: true, apiKey: "", headers: {} }),
		},
	});

	const result = await generateBuddyComment(ctx, baseConfig, baseConversation, "req-missing-api-key", {
		now: makeNow(3_000, 3_010),
	});

	assert.equal(result.source, "fallback");
	assert.equal(result.warningKey, "missing-api-key");
	assert.equal(result.trace.completeEntered, false);
	assert.equal(result.trace.fallbackReason, "missing-api-key");
	assert.equal(result.trace.httpErrorKind, "auth");
});

test("generateBuddyComment records empty-response traces when complete returns no usable text", async () => {
	const result = await generateBuddyComment(makeCtx(), baseConfig, baseConversation, "req-empty-response", {
		now: makeNow(4_000, 4_005, 4_060),
		completeFn: async () => ({
			content: [{ type: "text", text: "   \n   " }],
		}),
	});

	assert.equal(result.source, "fallback");
	assert.equal(result.warningKey, "empty-response");
	assert.equal(result.trace.completeEntered, true);
	assert.equal(result.trace.fallbackReason, "empty-response");
	assert.equal(result.trace.httpErrorKind, "parse-empty-content");
	assert.equal(result.trace.durationMs, 60);
});

test("generateBuddyComment records request-failed traces when complete throws", async () => {
	const result = await generateBuddyComment(makeCtx(), baseConfig, baseConversation, "req-request-failed", {
		now: makeNow(5_000, 5_015, 5_120),
		completeFn: async () => {
			throw new Error("ECONNRESET socket hang up");
		},
	});

	assert.equal(result.source, "fallback");
	assert.equal(result.warningKey, "request-failed");
	assert.equal(result.trace.completeEntered, true);
	assert.equal(result.trace.fallbackReason, "request-failed");
	assert.equal(result.trace.httpErrorKind, "dns-network");
	assert.match(result.trace.errorMessage ?? "", /ECONNRESET/);
});

test("generateBuddyComment records client-abort traces without fabricating a fallback source", async () => {
	const abortError = new Error("Request was aborted");
	abortError.name = "AbortError";
	const result = await generateBuddyComment(makeCtx(), baseConfig, baseConversation, "req-abort", {
		now: makeNow(6_000, 6_020, 6_090),
		completeFn: async () => {
			throw abortError;
		},
	});

	assert.equal(result.aborted, true);
	assert.equal(result.source, undefined);
	assert.equal(result.trace.completeEntered, true);
	assert.equal(result.trace.resultSource, undefined);
	assert.equal(result.trace.fallbackReason, "client-abort");
	assert.equal(result.trace.httpErrorKind, "client-abort");
});

test("generateBuddyComment records model traces on success", async () => {
	const result = await generateBuddyComment(makeCtx(), baseConfig, baseConversation, "req-success", {
		now: makeNow(7_000, 7_030, 7_120),
		completeFn: async () => ({
			content: [{ type: "text", text: '"Neat patch."' }],
		}),
	});

	assert.equal(result.source, "model");
	assert.equal(result.text, "Neat patch");
	assert.equal(result.trace.completeEntered, true);
	assert.equal(result.trace.resultSource, "model");
	assert.equal(result.trace.fallbackReason, undefined);
	assert.equal(result.trace.durationMs, 120);
});

test("sanitizeGeneratedComment trims long replies on a word boundary", () => {
	const sanitized = sanitizeGeneratedComment(
		"Purrfect sounds like the bug got swatted before it could pretend to be completely innocent for another sprint",
	);

	assert.equal(sanitized, "Purrfect sounds like the bug got swatted before it could pretend to…");
});

test("generateBuddyComment passes a Codex-friendly system prompt and concise user prompt", async () => {
	let capturedContext: { systemPrompt?: string; messages: Array<{ role: string; content: Array<{ type: string; text: string }> }> } | undefined;

	await generateBuddyComment(makeCtx(), baseConfig, baseConversation, "req-system-prompt", {
		now: makeNow(7_500, 7_530, 7_620),
		completeFn: async (_model, context) => {
			capturedContext = context;
			return {
				content: [{ type: "text", text: "Looks sharp" }],
			};
		},
	});

	assert.match(capturedContext?.systemPrompt ?? "", /tiny cat companion/i);
	assert.match(capturedContext?.systemPrompt ?? "", /one short aside/i);
	assert.match(capturedContext?.messages[0]?.content[0]?.text ?? "", /Drop a quick comment/);
	assert.doesNotMatch(capturedContext?.messages[0]?.content[0]?.text ?? "", /Rules:/);
});

test("classifyBuddyError recognizes rate limits and 5xx responses", () => {
	assert.equal(classifyBuddyError({ status: 429, message: "Too many requests" }).httpErrorKind, "rate-limit");
	assert.equal(classifyBuddyError({ response: { status: 503 }, message: "upstream unavailable" }).httpErrorKind, "5xx");
});

test("persistBuddyTraceEntry appends the buddy trace when diagnostics are enabled", () => {
	const result = generateBuddyTraceFixture();
	const calls: Array<{ customType: string; data: unknown }> = [];

	const status = persistBuddyTraceEntry(
		(customType, data) => calls.push({ customType, data }),
		BUDDY_TRACE_TYPE,
		true,
		result.trace,
		1,
		1,
	);

	assert.equal(status, "persisted");
	assert.deepEqual(calls, [{ customType: BUDDY_TRACE_TYPE, data: result.trace }]);
	assert.equal(isBuddyTrace(calls[0]?.data), true);
});

test("persistBuddyTraceEntry stays silent when diagnostics are disabled", () => {
	const result = generateBuddyTraceFixture();
	const calls: Array<{ customType: string; data: unknown }> = [];

	const status = persistBuddyTraceEntry(
		(customType, data) => calls.push({ customType, data }),
		BUDDY_TRACE_TYPE,
		false,
		result.trace,
		1,
		1,
	);

	assert.equal(status, "disabled");
	assert.deepEqual(calls, []);
});

test("persistBuddyTraceEntry blocks stale session traces when epochs diverge", () => {
	const result = generateBuddyTraceFixture();
	const calls: Array<{ customType: string; data: unknown }> = [];

	const status = persistBuddyTraceEntry(
		(customType, data) => calls.push({ customType, data }),
		BUDDY_TRACE_TYPE,
		true,
		result.trace,
		1,
		2,
	);

	assert.equal(status, "stale");
	assert.deepEqual(calls, []);
});

function generateBuddyTraceFixture() {
	return {
		trace: {
			requestId: "fixture-request",
			modelKey: "deepinfra/test-model",
			provider: "deepinfra",
			startedAt: 8_000,
			durationMs: 200,
			resultSource: "model" as const,
			attemptedQueryHash: "aaaaaaaaaaaaaaaa",
			completeEntered: true,
		},
	};
}

test("classifyBuddyError distinguishes auth, 4xx, dns-network, and unknown", () => {
	assert.equal(classifyBuddyError({ status: 401 }).httpErrorKind, "auth");
	assert.equal(classifyBuddyError({ status: 403, message: "forbidden" }).httpErrorKind, "auth");
	assert.equal(classifyBuddyError({ status: 400, message: "bad request" }).httpErrorKind, "4xx");
	assert.equal(classifyBuddyError({ status: 404, message: "not found" }).httpErrorKind, "4xx");
	assert.equal(classifyBuddyError({ message: "econnrefused" }).httpErrorKind, "dns-network");
	assert.equal(classifyBuddyError({ message: "econnreset" }).httpErrorKind, "dns-network");
	assert.equal(classifyBuddyError({ message: "enotfound" }).httpErrorKind, "dns-network");
	assert.equal(classifyBuddyError({ message: "etimedout" }).httpErrorKind, "dns-network");
	assert.equal(classifyBuddyError({ message: "fetch failed" }).httpErrorKind, "dns-network");
	assert.equal(classifyBuddyError({ message: "socket hang up" }).httpErrorKind, "dns-network");
	assert.equal(classifyBuddyError({ message: "completely unexpected error" }).httpErrorKind, "unknown");
});

test("classifyBuddyError traverses nested error.cause chains", () => {
	assert.equal(classifyBuddyError({ statusCode: "503", message: "server error" }).httpErrorKind, "5xx");
	assert.equal(classifyBuddyError({ response: { status: 503 }, message: "503" }).httpErrorKind, "5xx");
	const cause = { cause: { status: 503 } };
	assert.equal(classifyBuddyError(cause).httpErrorKind, "5xx");
});

test("generateBuddyComment never calls pi.appendEntry directly — persistence is owned by index.ts layer", async () => {
	const entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
	const ctx = makeCtx({
		modelRegistry: {
			find: () => undefined,
			getApiKeyAndHeaders: async () => {
				throw new Error("should not run");
			},
		},
	});

	const pi = { appendEntry: (type: string, data: unknown) => entries.push({ type, customType: undefined, data }) };

	await generateBuddyComment(ctx, traceEnabledConfig, baseConversation, "req-test", {
		now: makeNow(10_000, 10_010),
	});

	assert.equal(entries.length, 0, "appendEntry not called from companion — index.ts owns persistence");
});

test("generateBuddyComment always populates trace fields regardless of config.traceEnabled", async () => {
	const result = await generateBuddyComment(makeCtx(), baseConfig, baseConversation, "req-trace-off", {
		now: makeNow(11_000, 11_020, 11_150),
		completeFn: async () => ({
			content: [{ type: "text", text: '"Ship it."' }],
		}),
	});

	assert.equal(result.trace.completeEntered, true);
	assert.equal(result.trace.resultSource, "model");
	assert.equal(result.trace.fallbackReason, undefined);
	assert.equal(result.trace.httpErrorKind, undefined);
	assert.equal(result.trace.errorMessage, undefined);
	assert.equal(result.trace.durationMs, 150);
});
