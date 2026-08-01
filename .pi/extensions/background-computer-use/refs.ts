/**
 * Reference helpers for the bcu_capture / action-tool workflow.
 *
 * `bcu_capture` mints `@w1`, `@w2`, ... aliases for windows and `@e1`, `@e2`, ...
 * for elements. Refs and state tokens are bound to the active Pi session and
 * capture generation. Subsequent action tools accept the ref strings instead of
 * raw window IDs and element indices. `resolveRef` turns a tool's
 * `windowRef` / `elementRef` fields back into raw values, surfacing stale refs
 * as a structured `kind: "stale_ref"` result so callers do not dispatch a
 * transport request against a missing or rotated identifier.
 *
 * A capture attempt invalidates the previous generation before any sidecar
 * request. State tokens are short-lived and single-use in this adapter. These
 * checks narrow stale-state races, but the sidecar must cooperate to make
 * validation and mutation atomic against direct HTTP clients.
 */

export interface BcuRefs {
	windows: Record<string, string>;
	elements: Record<string, number>;
}

export interface ResolvedRef {
	window: string;
	elementIndex: number | undefined;
}

export interface RefResolution {
	resolved: ResolvedRef | undefined;
	staleRefs: string[];
	missingWindow: boolean;
}

export interface CachedRefs {
	refs: BcuRefs;
	windowId: string;
	sessionId: string;
	sessionGeneration: number;
	captureGeneration: number;
}

export interface BcuTargetIdentity {
	appName?: string;
	bundleId?: string;
	pid?: number;
	windowTitle?: string;
}

export interface StateTokenCapability {
	token: string;
	windowId: string;
	target: BcuTargetIdentity;
	sessionId: string;
	sessionGeneration: number;
	captureGeneration: number;
	expiresAt: number;
	used: boolean;
}

export type StateTokenDecision =
	| { ok: true; capability: StateTokenCapability }
	| { ok: false; reason: "missing" | "stale" | "expired" | "replayed" | "window_mismatch" };

let cached: CachedRefs | undefined;
let activeSessionId = "extension-initialization";
let sessionGeneration = 1;
let captureGeneration = 0;
let sidecarIdentity: string | undefined;
const stateTokens = new Map<string, StateTokenCapability>();
const seenTokens = new Set<string>();

function clearCaptureState(): void {
	cached = undefined;
	stateTokens.clear();
}

export function beginSession(sessionId: string): void {
	activeSessionId = sessionId;
	sessionGeneration += 1;
	captureGeneration = 0;
	sidecarIdentity = undefined;
	clearCaptureState();
	seenTokens.clear();
}

export function invalidateSession(): void {
	activeSessionId = "";
	sessionGeneration += 1;
	captureGeneration = 0;
	sidecarIdentity = undefined;
	clearCaptureState();
	seenTokens.clear();
}

export function invalidateCapture(): void {
	captureGeneration += 1;
	clearCaptureState();
}

export function bindSidecar(identity: string): void {
	if (sidecarIdentity !== undefined && sidecarIdentity !== identity) {
		invalidateCapture();
		seenTokens.clear();
	}
	sidecarIdentity = identity;
}

export function setCurrentRefs(refs: BcuRefs, windowId: string): void {
	cached = { refs, windowId, sessionId: activeSessionId, sessionGeneration, captureGeneration };
}

export function clearCurrentRefs(): void {
	clearCaptureState();
}

export function currentRefs(): CachedRefs | undefined {
	return cached;
}

export function recordStateCapture(options: {
	windowId: string;
	stateToken?: string;
	target?: BcuTargetIdentity;
	refs?: BcuRefs;
	ttlMs: number;
	now?: number;
}): boolean {
	invalidateCapture();
	if (options.refs) setCurrentRefs(options.refs, options.windowId);
	if (!options.stateToken || !activeSessionId || seenTokens.has(options.stateToken)) return false;
	const now = options.now ?? Date.now();
	seenTokens.add(options.stateToken);
	stateTokens.set(options.stateToken, {
		token: options.stateToken,
		windowId: options.windowId,
		target: options.target ?? {},
		sessionId: activeSessionId,
		sessionGeneration,
		captureGeneration,
		expiresAt: now + options.ttlMs,
		used: false,
	});
	return true;
}

export function consumeStateToken(token: string | undefined, windowId: string, now = Date.now()): StateTokenDecision {
	if (!token) return { ok: false, reason: "missing" };
	const capability = stateTokens.get(token);
	if (
		!capability ||
		capability.sessionId !== activeSessionId ||
		capability.sessionGeneration !== sessionGeneration ||
		capability.captureGeneration !== captureGeneration
	) {
		return { ok: false, reason: "stale" };
	}
	if (capability.windowId !== windowId) return { ok: false, reason: "window_mismatch" };
	if (capability.expiresAt <= now) return { ok: false, reason: "expired" };
	if (capability.used) return { ok: false, reason: "replayed" };
	capability.used = true;
	return { ok: true, capability };
}

export function recordPostStateToken(
	previous: StateTokenCapability,
	token: string | undefined,
	ttlMs: number,
	now = Date.now(),
): boolean {
	if (!token || seenTokens.has(token)) return false;
	if (
		previous.sessionId !== activeSessionId ||
		previous.sessionGeneration !== sessionGeneration ||
		previous.captureGeneration !== captureGeneration
	) {
		return false;
	}
	seenTokens.add(token);
	stateTokens.set(token, {
		...previous,
		token,
		expiresAt: now + ttlMs,
		used: false,
	});
	return true;
}

export function emptyRefs(): BcuRefs {
	return { windows: {}, elements: {} };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRefs(value: unknown): BcuRefs | undefined {
	if (!isPlainObject(value)) return undefined;
	const windows = isPlainObject(value.windows) ? (value.windows as Record<string, unknown>) : undefined;
	const elements = isPlainObject(value.elements) ? (value.elements as Record<string, unknown>) : undefined;
	if (!windows && !elements) return undefined;
	const result: BcuRefs = { windows: {}, elements: {} };
	if (windows) {
		for (const [key, raw] of Object.entries(windows)) {
			if (typeof raw === "string") result.windows[key] = raw;
		}
	}
	if (elements) {
		for (const [key, raw] of Object.entries(elements)) {
			if (typeof raw === "number" && Number.isFinite(raw)) result.elements[key] = raw;
		}
	}
	return result;
}

export function resolveRef(inputs: {
	window?: string;
	windowRef?: string;
	elementIndex?: number;
	elementRef?: string;
	refs?: BcuRefs;
}): RefResolution {
	const staleRefs: string[] = [];
	const refs = inputs.refs;

	let windowId: string | undefined;
	if (inputs.windowRef !== undefined) {
		if (refs && Object.prototype.hasOwnProperty.call(refs.windows, inputs.windowRef)) {
			windowId = refs.windows[inputs.windowRef];
		} else {
			staleRefs.push(inputs.windowRef);
		}
	} else if (inputs.window !== undefined) {
		windowId = inputs.window;
	}

	let elementIndex: number | undefined = inputs.elementIndex;
	if (inputs.elementRef !== undefined) {
		if (refs && Object.prototype.hasOwnProperty.call(refs.elements, inputs.elementRef)) {
			elementIndex = refs.elements[inputs.elementRef];
		} else {
			staleRefs.push(inputs.elementRef);
		}
	}

	return {
		resolved: windowId !== undefined ? { window: windowId, elementIndex } : undefined,
		staleRefs,
		missingWindow: windowId === undefined,
	};
}

export function resolveRefFromCache(inputs: {
	window?: string;
	windowRef?: string;
	elementIndex?: number;
	elementRef?: string;
}): RefResolution {
	const cachedRefs =
		cached?.sessionId === activeSessionId &&
		cached.sessionGeneration === sessionGeneration &&
		cached.captureGeneration === captureGeneration
			? cached.refs
			: undefined;
	return resolveRef({ ...inputs, refs: cachedRefs });
}
