import { createHash, randomBytes } from "node:crypto";

export type BuddyResultSource = "model" | "fallback";
export type BuddyFallbackReason = "model-missing" | "auth-error" | "missing-api-key" | "empty-response" | "request-failed" | "client-abort";
export type BuddyHttpErrorKind = "dns-network" | "auth" | "4xx" | "5xx" | "rate-limit" | "parse-empty-content" | "client-abort" | "unknown";

export interface BuddyTrace {
	requestId: string;
	modelKey: string;
	provider: string;
	startedAt: number;
	durationMs: number;
	resultSource?: BuddyResultSource;
	fallbackReason?: BuddyFallbackReason;
	httpErrorKind?: BuddyHttpErrorKind;
	errorMessage?: string;
	attemptedQueryHash: string;
	completeEntered: boolean;
}

export type BuddyTracePersistenceResult = "persisted" | "disabled" | "stale";

export function createBuddyRequestId(): string {
	return randomBytes(4).toString("hex");
}

export function hashBuddyQuery(query: string): string {
	return createHash("sha256").update(query).digest("hex").slice(0, 16);
}

function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "object" && error !== null) {
		const msg = (error as { message?: unknown }).message;
		if (typeof msg === "string") return msg;
	}
	return String(error);
}

function getNumericStatus(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function extractStatusCode(error: unknown): number | undefined {
	if (!error || typeof error !== "object") return undefined;

	const maybeError = error as {
		status?: unknown;
		statusCode?: unknown;
		response?: { status?: unknown };
		cause?: unknown;
	};

	return (
		getNumericStatus(maybeError.status) ??
		getNumericStatus(maybeError.statusCode) ??
		getNumericStatus(maybeError.response?.status) ??
		extractStatusCode(maybeError.cause)
	);
}

export function classifyBuddyError(error: unknown): { httpErrorKind: BuddyHttpErrorKind; errorMessage: string } {
	const errorMessage = extractErrorMessage(error);
	const message = errorMessage.toLowerCase();
	const status = extractStatusCode(error);
	const name = error instanceof Error ? error.name.toLowerCase() : "";

	if (name === "aborterror" || message.includes("request was aborted") || message.includes("abort")) {
		return { httpErrorKind: "client-abort", errorMessage };
	}

	if (status === 429 || message.includes("rate limit") || message.includes("too many requests")) {
		return { httpErrorKind: "rate-limit", errorMessage };
	}

	if (status === 401 || status === 403 || message.includes("unauthorized") || message.includes("forbidden") || message.includes("invalid token")) {
		return { httpErrorKind: "auth", errorMessage };
	}

	if (status !== undefined && status >= 500) {
		return { httpErrorKind: "5xx", errorMessage };
	}

	if (status !== undefined && status >= 400) {
		return { httpErrorKind: "4xx", errorMessage };
	}

	if (
		message.includes("econnrefused") ||
		message.includes("econnreset") ||
		message.includes("enotfound") ||
		message.includes("eai_again") ||
		message.includes("etimedout") ||
		message.includes("network") ||
		message.includes("fetch failed") ||
		message.includes("socket hang up")
	) {
		return { httpErrorKind: "dns-network", errorMessage };
	}

	return { httpErrorKind: "unknown", errorMessage };
}

export function isBuddyTrace(value: unknown): value is BuddyTrace {
	if (!value || typeof value !== "object") return false;
	const trace = value as Partial<BuddyTrace>;
	return (
		typeof trace.requestId === "string" &&
		typeof trace.modelKey === "string" &&
		typeof trace.provider === "string" &&
		typeof trace.startedAt === "number" &&
		Number.isFinite(trace.startedAt) &&
		typeof trace.durationMs === "number" &&
		Number.isFinite(trace.durationMs) &&
		typeof trace.attemptedQueryHash === "string" &&
		typeof trace.completeEntered === "boolean"
	);
}

export function persistBuddyTraceEntry(
	appendEntry: (customType: string, data: unknown) => void,
	customType: string,
	traceEnabled: boolean,
	trace: BuddyTrace,
	epoch: number,
	sessionEpoch: number,
): BuddyTracePersistenceResult {
	if (epoch !== sessionEpoch) return "stale";
	if (!traceEnabled) return "disabled";
	appendEntry(customType, trace);
	return "persisted";
}
