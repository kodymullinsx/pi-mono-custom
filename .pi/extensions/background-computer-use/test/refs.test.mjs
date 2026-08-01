import assert from "node:assert/strict";
import test from "node:test";

import {
	currentRefs,
	emptyRefs,
	readRefs,
	resolveRef,
	resolveRefFromCache,
	setCurrentRefs,
	clearCurrentRefs,
	beginSession,
	bindSidecar,
	consumeStateToken,
	invalidateCapture,
	recordPostStateToken,
	recordStateCapture,
} from "../refs.ts";

test("resolveRef prefers windowRef over window when the ref resolves", () => {
	const refs = { windows: { "@w1": "win-1" }, elements: { "@e3": 17 } };
	const resolution = resolveRef({ window: "win-raw", windowRef: "@w1", elementIndex: 0, elementRef: "@e3", refs });
	assert.deepEqual(resolution.staleRefs, []);
	assert.equal(resolution.missingWindow, false);
	assert.equal(resolution.resolved?.window, "win-1");
	assert.equal(resolution.resolved?.elementIndex, 17);
});

test("resolveRef falls back to raw window and elementIndex when no refs are set", () => {
	const resolution = resolveRef({ window: "win-raw", elementIndex: 4 });
	assert.deepEqual(resolution.staleRefs, []);
	assert.equal(resolution.resolved?.window, "win-raw");
	assert.equal(resolution.resolved?.elementIndex, 4);
});

test("resolveRef flags a stale windowRef and does not synthesize a window", () => {
	const refs = { windows: { "@w1": "win-1" }, elements: {} };
	const resolution = resolveRef({ windowRef: "@w99", window: "fallback", refs });
	assert.deepEqual(resolution.staleRefs, ["@w99"]);
	assert.equal(resolution.missingWindow, true);
	assert.equal(resolution.resolved, undefined);
});

test("resolveRef flags a stale elementRef but keeps the resolved window", () => {
	const refs = { windows: { "@w1": "win-1" }, elements: { "@e3": 17 } };
	const resolution = resolveRef({ windowRef: "@w1", elementRef: "@e999", refs });
	assert.deepEqual(resolution.staleRefs, ["@e999"]);
	assert.equal(resolution.resolved?.window, "win-1");
	assert.equal(resolution.resolved?.elementIndex, undefined);
});

test("resolveRef reports missingWindow when neither window nor windowRef is usable", () => {
	const resolution = resolveRef({});
	assert.equal(resolution.missingWindow, true);
	assert.equal(resolution.resolved, undefined);
});

test("resolveRefFromCache reads the latest bcu_capture ref map", () => {
	clearCurrentRefs();
	try {
		setCurrentRefs({ windows: { "@w1": "win-cached" }, elements: { "@e3": 11 } }, "win-cached");
		const resolution = resolveRefFromCache({ windowRef: "@w1", elementRef: "@e3" });
		assert.equal(resolution.resolved?.window, "win-cached");
		assert.equal(resolution.resolved?.elementIndex, 11);
	} finally {
		clearCurrentRefs();
	}
});

test("resolveRefFromCache marks refs stale when no capture has run", () => {
	clearCurrentRefs();
	const resolution = resolveRefFromCache({ windowRef: "@w1" });
	assert.deepEqual(resolution.staleRefs, ["@w1"]);
	assert.equal(resolution.missingWindow, true);
});

test("currentRefs returns the cached value when set", () => {
	clearCurrentRefs();
	try {
		const refs = { windows: { "@w1": "win-x" }, elements: {} };
		setCurrentRefs(refs, "win-x");
		const cached = currentRefs();
		assert.equal(cached?.windowId, "win-x");
		assert.deepEqual(cached?.refs, refs);
	} finally {
		clearCurrentRefs();
	}
});

test("readRefs normalizes unknown shapes into a typed ref map", () => {
	const refs = readRefs({
		windows: { "@w1": "win-1", dropped: 5 },
		elements: { "@e3": 17, dropped: "x" },
	});
	assert.deepEqual(refs, { windows: { "@w1": "win-1" }, elements: { "@e3": 17 } });
});

test("readRefs returns undefined for non-object input", () => {
	assert.equal(readRefs(undefined), undefined);
	assert.equal(readRefs("nope"), undefined);
	assert.equal(readRefs([]), undefined);
	assert.equal(readRefs({}), undefined);
	assert.deepEqual(readRefs({ windows: { "@w1": "win-1" } }), { windows: { "@w1": "win-1" }, elements: {} });
});

test("emptyRefs returns an empty ref map", () => {
	assert.deepEqual(emptyRefs(), { windows: {}, elements: {} });
});

test("state tokens are session-bound, short-lived, and single-use", () => {
	beginSession("session-a");
	recordStateCapture({
		windowId: "win-1",
		stateToken: "token-1",
		target: { appName: "TextEdit" },
		ttlMs: 100,
		now: 1_000,
	});
	const first = consumeStateToken("token-1", "win-1", 1_050);
	assert.equal(first.ok, true);
	assert.deepEqual(consumeStateToken("token-1", "win-1", 1_050), { ok: false, reason: "replayed" });
	assert.equal(first.ok && recordPostStateToken(first.capability, "token-2", 100, 1_050), true);
	assert.equal(consumeStateToken("token-2", "win-1", 1_151).ok, false, "post-state token expires");
	beginSession("session-b");
	assert.deepEqual(consumeStateToken("token-2", "win-1", 1_060), { ok: false, reason: "stale" });
});

test("capture generation and sidecar changes invalidate refs and tokens", () => {
	beginSession("session-generation");
	recordStateCapture({
		windowId: "win-1",
		stateToken: "token-current",
		refs: { windows: { "@w1": "win-1" }, elements: {} },
		ttlMs: 1_000,
		now: 0,
	});
	assert.equal(resolveRefFromCache({ windowRef: "@w1" }).resolved?.window, "win-1");
	invalidateCapture();
	assert.deepEqual(resolveRefFromCache({ windowRef: "@w1" }).staleRefs, ["@w1"]);
	assert.deepEqual(consumeStateToken("token-current", "win-1", 1), { ok: false, reason: "stale" });

	recordStateCapture({ windowId: "win-2", stateToken: "token-sidecar", ttlMs: 1_000, now: 0 });
	bindSidecar("launch-a");
	bindSidecar("launch-b");
	assert.deepEqual(consumeStateToken("token-sidecar", "win-2", 1), { ok: false, reason: "stale" });
});

test("state tokens reject missing, expired, and cross-window use", () => {
	beginSession("session-negative");
	recordStateCapture({ windowId: "win-1", stateToken: "token-expiring", ttlMs: 10, now: 100 });
	assert.deepEqual(consumeStateToken(undefined, "win-1", 101), { ok: false, reason: "missing" });
	assert.deepEqual(consumeStateToken("token-expiring", "win-2", 101), { ok: false, reason: "window_mismatch" });
	assert.deepEqual(consumeStateToken("token-expiring", "win-1", 110), { ok: false, reason: "expired" });
});
