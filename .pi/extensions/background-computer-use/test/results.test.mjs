import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";

import {
	errorResult,
	formatActionResult,
	formatBatchResult,
	formatCaptureResult,
	formatGetWindowStateResult,
	formatListAppsResult,
	formatListWindowsResult,
	formatMotionActionResult,
	formatRoutesResult,
	formatStatusResult,
	mintCaptureRefs,
	selectWindowForCapture,
} from "../results.ts";

function crc32(data) {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc ^= byte;
		for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, payload = Buffer.alloc(0)) {
	const typeBytes = Buffer.from(type, "ascii");
	const chunk = Buffer.alloc(12 + payload.length);
	chunk.writeUInt32BE(payload.length, 0);
	typeBytes.copy(chunk, 4);
	payload.copy(chunk, 8);
	chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, payload])), 8 + payload.length);
	return chunk;
}

function validPng(totalBytes) {
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(1, 0);
	ihdr.writeUInt32BE(1, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	const idat = pngChunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 0, 0])));
	const fixed = [signature, pngChunk("IHDR", ihdr), idat, pngChunk("IEND")];
	const fixedLength = fixed.reduce((sum, item) => sum + item.length, 0);
	if (totalBytes === undefined || totalBytes === fixedLength) return Buffer.concat(fixed);
	if (totalBytes < fixedLength + 12) throw new Error("Requested PNG size is too small for padding.");
	return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("tEXt", Buffer.alloc(totalBytes - fixedLength - 12)), idat, pngChunk("IEND")]);
}

const PNG_BYTES = validPng();
const JPEG_BYTES = Buffer.from([
	0xff, 0xd8,
	0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
	0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
	0x00, 0xff, 0xd9,
]);
import { SUPPORTED_CONTRACT_VERSION } from "../config.ts";

function config(root) {
	return {
		manifestPath: path.join(root, "manifest.json"),
		manifestCandidatePaths: [path.join(root, "manifest.json")],
		timeoutMs: 1000,
		startTimeoutMs: 5000,
		debug: false,
		enableActions: false,
		autoStart: false,
		maxImageBytes: 1024 * 1024,
		actionLockPath: path.join(root, "action.lock"),
		actionLockTtlMs: 30_000,
	};
}

test("status result summarizes errors, warnings, actions, and debug manifest diagnostics", () => {
	const result = formatStatusResult(
		{
			manifestPath: "/tmp/fallback.json",
			configuredManifestPath: "/tmp/configured.json",
			manifestCandidatePaths: ["/tmp/configured.json", "/tmp/fallback.json"],
			errors: [],
			warnings: ["contract warning"],
			missingRoutes: ["POST /v1/get_window_state (get_window_state)"],
			contractSupported: false,
		},
		true,
		{ actionsEnabled: true },
	);
	const text = result.content[0].text;
	assert.match(text, /BackgroundComputerUse status/);
	assert.match(text, /Configured manifest: \/tmp\/configured.json/);
	assert.match(text, /Pi action tools: enabled/);
	assert.match(text, /Manifest candidates:/);
	assert.match(text, /\/tmp\/fallback.json/);
	assert.match(text, /Missing required routes:/);
	assert.match(text, /contract warning/);
	assert.equal(result.details.kind, "status");
	assert.equal(result.details.actionsEnabled, true);
});

test("route result lists routes compactly", () => {
	const result = formatRoutesResult({
		contractVersion: SUPPORTED_CONTRACT_VERSION,
		routes: [{ id: "health", method: "GET", path: "/health", category: "system", summary: "Health" }],
	});
	assert.match(result.content[0].text, /GET \/health/);
	assert.equal(result.details.count, 1);
});

test("app and window formatting stay concise", () => {
	const apps = formatListAppsResult({
		contractVersion: SUPPORTED_CONTRACT_VERSION,
		frontmostApp: { name: "TextEdit", bundleID: "com.apple.TextEdit" },
		runningApps: [{ name: "TextEdit", bundleID: "com.apple.TextEdit", pid: 42, onscreenWindowCount: 1 }],
		notes: [],
	});
	assert.match(apps.content[0].text, /TextEdit/);

	const windows = formatListWindowsResult({
		contractVersion: SUPPORTED_CONTRACT_VERSION,
		app: { name: "TextEdit" },
		windows: [{ windowID: "win-1", title: "Scratch", isFocused: true, isMain: true }],
		notes: [],
	});
	assert.match(windows.content[0].text, /win-1 - Scratch/);
});

test("action formatting preserves success and verifier classifications", () => {
	const success = formatActionResult("press_key", "POST /v1/press_key", {
		ok: true,
		classification: "success",
		summary: "Key delivered.",
		window: { windowID: "win-1", title: "Scratch" },
		preStateToken: "pre",
		postStateToken: "post",
		warnings: [],
		verification: { route: "native" },
	});
	assert.match(success.content[0].text, /Classification: success/);
	assert.equal(success.details.ok, true);
	assert.equal(success.details.postStateToken, "post");

	const ambiguous = formatActionResult("click", "POST /v1/click", {
		ok: false,
		classification: "verifier_ambiguous",
		failureDomain: "verification",
		summary: "The click was refused because the target was stale.",
		warnings: ["stale token"],
		verification: { issueBucket: "stale_target", visualDiff: { changed: false } },
	});
	assert.match(ambiguous.content[0].text, /Classification: verifier_ambiguous/);
	assert.match(ambiguous.content[0].text, /stale token/);
	assert.equal(ambiguous.details.ok, false);
	assert.deepEqual(ambiguous.details.response.verification.issueBucket, "stale_target");
});

test("window state formatting omits base64 text but can attach image blocks", async () => {
	const result = await formatGetWindowStateResult(
		{
			contractVersion: SUPPORTED_CONTRACT_VERSION,
			stateToken: "state-1",
			window: { windowID: "win-1", title: "Scratch" },
			screenshot: {
				status: "ok",
				image: {
					imageBase64: PNG_BYTES.toString("base64"),
					mimeType: "image/png",
					pixelWidth: 10,
					pixelHeight: 5,
				},
			},
			tree: { nodes: [{ index: 0 }] },
			focusedElement: { index: 0, displayRole: "text" },
			performance: { totalMs: 2 },
			notes: ["debug note"],
		},
		{ includeImage: true, debug: true, config: config(os.tmpdir()) },
	);
	assert.match(result.content[0].text, /Screenshot base64: available but omitted/);
	assert.doesNotMatch(result.content[0].text, /ZmFrZQ==/);
	assert.equal(result.content.some((block) => block.type === "image"), true);
	assert.equal(result.details.stateToken, "state-1");
	assert.equal(result.details.response.screenshot.image.imageBase64, "[redacted]");
});

test("base64 and compatibility-path screenshots enforce the exact 6 MiB decoded boundary", async () => {
	const maxBytes = 6 * 1024 * 1024;
	const exact = validPng(maxBytes);
	const oversized = validPng(maxBytes + 1);
	const boundedConfig = { ...config(os.tmpdir()), maxImageBytes: maxBytes };
	const state = (image) => ({
		stateToken: "state-boundary",
		window: { windowID: "win-boundary" },
		screenshot: { status: "ok", image: { ...image, mimeType: "image/png" } },
	});

	const exactBase64 = await formatGetWindowStateResult(state({ imageBase64: exact.toString("base64") }), {
		includeImage: true,
		config: boundedConfig,
	});
	assert.equal(exactBase64.content.some((block) => block.type === "image"), true);
	const oversizedBase64 = await formatGetWindowStateResult(state({ imageBase64: oversized.toString("base64") }), {
		includeImage: true,
		config: boundedConfig,
	});
	assert.equal(oversizedBase64.content.some((block) => block.type === "image"), false);
	const malformed = await formatGetWindowStateResult(state({ imageBase64: "not+canonical===" }), {
		includeImage: true,
		config: boundedConfig,
	});
	assert.equal(malformed.content.some((block) => block.type === "image"), false);

	const captureRoot = path.join((process.env.TMPDIR ?? os.tmpdir()).replace(/\/+$/, ""), "background-computer-use", "captures");
	await fs.mkdir(captureRoot, { recursive: true });
	const exactPath = path.join(captureRoot, `boundary-${Date.now()}.png`);
	const oversizedPath = path.join(captureRoot, `oversized-${Date.now()}.png`);
	await fs.writeFile(exactPath, exact);
	await fs.writeFile(oversizedPath, oversized);
	try {
		const exactPathResult = await formatGetWindowStateResult(state({ imagePath: exactPath }), {
			includeImage: true,
			config: boundedConfig,
		});
		assert.equal(exactPathResult.content.some((block) => block.type === "image"), true);
		const oversizedPathResult = await formatGetWindowStateResult(state({ imagePath: oversizedPath }), {
			includeImage: true,
			config: boundedConfig,
		});
		assert.equal(oversizedPathResult.content.some((block) => block.type === "image"), false);
	} finally {
		await fs.rm(exactPath, { force: true });
		await fs.rm(oversizedPath, { force: true });
	}
});

test("model-visible details redact authorization and inline raw bytes recursively", () => {
	const result = formatActionResult("click", "POST /v1/click", {
		ok: true,
		authorization: "Bearer secret",
		nested: { authorizationToken: "secret", imageBytes: "raw", imageBase64: "bytes" },
	});
	const serialized = JSON.stringify(result.details);
	assert.doesNotMatch(serialized, /Bearer secret|"secret"|"raw"|"bytes"/);
	assert.match(serialized, /\[redacted\]/);
});

test("window state only attaches screenshot paths under the BCU temp root", async () => {
	const tmpRoot = path.join((process.env.TMPDIR ?? os.tmpdir()).replace(/\/+$/, ""), "background-computer-use", "captures");
	await fs.mkdir(tmpRoot, { recursive: true });
	const imagePath = path.join(tmpRoot, `test-${Date.now()}.png`);
	await fs.writeFile(imagePath, PNG_BYTES);
	try {
		const result = await formatGetWindowStateResult(
			{
				stateToken: "state-2",
				window: { windowID: "win-2" },
				screenshot: {
					status: "ok",
					image: { imagePath, mimeType: "image/png", pixelWidth: 1, pixelHeight: 1 },
				},
				tree: { nodes: [] },
				focusedElement: {},
				performance: {},
				notes: [],
			},
			{ includeImage: true, config: config(os.tmpdir()) },
		);
		assert.equal(result.content.some((block) => block.type === "image"), true);
	} finally {
		await fs.rm(imagePath, { force: true });
	}
});

test("window state rejects screenshot symlinks and invalid image signatures", async () => {
	const tempBase = (process.env.TMPDIR ?? os.tmpdir()).replace(/\/+$/, "");
	const captureRoot = path.join(tempBase, "background-computer-use", "captures");
	await fs.mkdir(captureRoot, { recursive: true });
	const outside = path.join(tempBase, `bcu-outside-${Date.now()}.png`);
	const symlink = path.join(captureRoot, `symlink-${Date.now()}.png`);
	const outsideParent = path.join(tempBase, `bcu-outside-parent-${Date.now()}`);
	const linkedParent = path.join(captureRoot, `linked-parent-${Date.now()}`);
	await fs.writeFile(outside, PNG_BYTES);
	await fs.symlink(outside, symlink);
	await fs.mkdir(outsideParent);
	await fs.writeFile(path.join(outsideParent, "outside.png"), PNG_BYTES);
	await fs.symlink(outsideParent, linkedParent, "dir");
	try {
		const symlinkResult = await formatGetWindowStateResult(
			{
				stateToken: "state-symlink",
				window: { windowID: "win-symlink" },
				screenshot: { status: "ok", image: { imagePath: symlink, mimeType: "image/png" } },
			},
			{ includeImage: true, config: config(os.tmpdir()) },
		);
		assert.equal(symlinkResult.content.some((block) => block.type === "image"), false);

		const parentSymlinkResult = await formatGetWindowStateResult(
			{
				stateToken: "state-parent-symlink",
				window: { windowID: "win-parent-symlink" },
				screenshot: { status: "ok", image: { imagePath: path.join(linkedParent, "outside.png"), mimeType: "image/png" } },
			},
			{ includeImage: true, config: config(os.tmpdir()) },
		);
		assert.equal(parentSymlinkResult.content.some((block) => block.type === "image"), false);

		const invalidBase64Result = await formatGetWindowStateResult(
			{
				stateToken: "state-invalid",
				window: { windowID: "win-invalid" },
				screenshot: {
					status: "ok",
					image: { imageBase64: Buffer.from("not an image").toString("base64"), mimeType: "image/png" },
				},
			},
			{ includeImage: true, config: config(os.tmpdir()) },
		);
		assert.equal(invalidBase64Result.content.some((block) => block.type === "image"), false);

		const validJpegResult = await formatGetWindowStateResult(
			{ stateToken: "state-jpeg", window: { windowID: "win-jpeg" }, screenshot: { status: "ok", image: { imageBase64: JPEG_BYTES.toString("base64"), mimeType: "image/jpeg" } } },
			{ includeImage: true, config: config(os.tmpdir()) },
		);
		assert.equal(validJpegResult.content.some((block) => block.type === "image"), true);

		for (const [name, bytes] of [
			["truncated", PNG_BYTES.subarray(0, PNG_BYTES.length - 4)],
			["signature-garbage", Buffer.concat([PNG_BYTES.subarray(0, 8), Buffer.from("garbage")])],
			["trailing-garbage", Buffer.concat([PNG_BYTES, Buffer.from("garbage")])],
			["jpeg-truncated", JPEG_BYTES.subarray(0, JPEG_BYTES.length - 2)],
			["jpeg-signature-garbage", Buffer.concat([JPEG_BYTES.subarray(0, 2), Buffer.from("garbage")])],
			["jpeg-trailing-garbage", Buffer.concat([JPEG_BYTES, Buffer.from("garbage")])],
		]) {
			const rejected = await formatGetWindowStateResult(
				{ stateToken: `state-${name}`, window: { windowID: `win-${name}` }, screenshot: { status: "ok", image: { imageBase64: bytes.toString("base64"), mimeType: "image/png" } } },
				{ includeImage: true, config: config(os.tmpdir()) },
			);
			assert.equal(rejected.content.some((block) => block.type === "image"), false, name);
		}
	} finally {
		await fs.rm(symlink, { force: true });
		await fs.rm(linkedParent, { force: true });
		await fs.rm(outsideParent, { recursive: true, force: true });
		await fs.rm(outside, { force: true });
	}
});

test("errorResult surfaces a lockReleaseError property from thrown errors", () => {
	const thrown = new Error("action body rejected");
	thrown.lockReleaseError = "permission denied on /tmp/bcu.lock";
	const result = formatActionResult("click", "POST /v1/click", { ok: false, summary: "Action body rejected." });
	assert.equal(result.details.ok, false);
	// Import errorResult via the index module to ensure the wiring is correct.
	return import("../results.ts").then(({ errorResult }) => {
		const surfaced = errorResult(thrown, "Failed to click BackgroundComputerUse target");
		assert.equal(surfaced.details.ok, false);
		assert.equal(surfaced.details.kind, "error");
		assert.equal(surfaced.details.errorCode, "unknown");
		assert.equal(surfaced.details.lockReleaseError, "permission denied on /tmp/bcu.lock");
		assert.match(surfaced.content[0].text, /Failed to click BackgroundComputerUse target: action body rejected/);
		assert.match(surfaced.content[0].text, /Warning: action completed, but the local action lock could not be released: permission denied/);
	});
});

test("selectWindowForCapture picks focused > main > first visible > first listed", () => {
	const focused = { windowID: "w-focused", isFocused: true, isMain: true };
	const main = { windowID: "w-main", isFocused: false, isMain: true };
	const visible = { windowID: "w-visible", isFocused: false, isMain: false, isOnScreen: true };
	const offscreen = { windowID: "w-off", isFocused: false, isOnScreen: false };
	assert.equal(selectWindowForCapture([visible, main, focused])?.windowID, "w-focused");
	assert.equal(selectWindowForCapture([visible, main])?.windowID, "w-main");
	assert.equal(selectWindowForCapture([visible, offscreen])?.windowID, "w-visible");
	assert.equal(selectWindowForCapture([offscreen])?.windowID, "w-off");
	assert.equal(selectWindowForCapture([]), undefined);
});

test("selectWindowForCapture prefers a title substring match when windowTitle is set", () => {
	const w1 = { windowID: "w1", title: "Untitled" };
	const w2 = { windowID: "w2", title: "Scratchpad - draft", isFocused: true };
	assert.equal(selectWindowForCapture([w1, w2], "Scratchpad")?.windowID, "w2");
	assert.equal(selectWindowForCapture([w1, w2], "Untitled")?.windowID, "w1");
	assert.equal(selectWindowForCapture([w1, w2], "missing"), undefined);
	assert.equal(selectWindowForCapture([w1, { ...w1, windowID: "w3" }], "Untitled"), undefined);
});

test("mintCaptureRefs mints a window alias and element indices from tree.nodes", () => {
	const refs = mintCaptureRefs(
		{
			tree: {
				nodes: [{ index: 0 }, { index: 5 }, { index: 17 }],
			},
		},
		"win-1",
	);
	assert.deepEqual(refs, {
		windows: { "@w1": "win-1" },
		elements: { "@e1": 0, "@e2": 5, "@e3": 17 },
	});
});

test("mintCaptureRefs returns an empty elements map when the tree is empty", () => {
	const refs = mintCaptureRefs({ tree: { nodes: [] } }, "win-x");
	assert.deepEqual(refs, { windows: { "@w1": "win-x" }, elements: {} });
});

test("formatCaptureResult includes the selected window and refs map", async () => {
	const stateResponse = {
		contractVersion: "test",
		stateToken: "state-1",
		window: { windowID: "win-1", title: "Scratch" },
		screenshot: { status: "omitted" },
		tree: { nodes: [{ index: 2 }, { index: 7 }] },
		focusedElement: { index: 2, displayRole: "text" },
		performance: { totalMs: 3 },
		notes: [],
	};
	const listResponse = {
		contractVersion: "test",
		app: { name: "TextEdit" },
		windows: [{ windowID: "win-1", title: "Scratch", isFocused: true, isMain: true }],
	};
	const refs = mintCaptureRefs(stateResponse, "win-1");
	const result = await formatCaptureResult(
		stateResponse,
		{ windowID: "win-1", title: "Scratch", isFocused: true, isMain: true },
		refs,
		listResponse,
		{ config: config(os.tmpdir()) },
	);
	assert.equal(result.details.kind, "capture");
	assert.equal(result.details.windowID, "win-1");
	assert.equal(result.details.stateToken, "state-1");
	assert.deepEqual(result.details.refs, refs);
	assert.match(result.content[0].text, /Selected window: @w1 -> win-1 \(Scratch\) \[focused, main\]/);
	assert.match(result.content[0].text, /@e1: 2/);
	assert.match(result.content[0].text, /@e2: 7/);
});

test("formatMotionActionResult surfaces cursor, window frame, and background safety", () => {
	const result = formatMotionActionResult("move_window", "POST /v1/drag", {
		ok: true,
		cursor: { position: { x: 100, y: 200 } },
		window: { frame: { x: 0, y: 0, width: 800, height: 600 } },
		backgroundSafety: { safe: true, reason: "on-screen" },
	});
	assert.equal(result.details.kind, "motion");
	assert.equal(result.details.ok, true);
	assert.equal(result.details.action, "move_window");
	assert.equal(result.details.route, "POST /v1/drag");
	assert.match(result.content[0].text, /Cursor: \(100, 200\)/);
	assert.match(result.content[0].text, /Window frame: x=0 y=0 width=800 height=600/);
	assert.match(result.content[0].text, /Background safety: safe \(on-screen\)/);
});

test("formatMotionActionResult tolerates missing cursor and background safety", () => {
	const result = formatMotionActionResult("set_window_frame", "POST /v1/set_window_frame", {
		ok: false,
		window: { frame: { x: 10, y: 20, width: 400, height: 300 } },
	});
	assert.equal(result.details.ok, false);
	assert.match(result.content[0].text, /Result: not verified/);
	assert.match(result.content[0].text, /Window frame: x=10 y=20 width=400 height=300/);
	assert.doesNotMatch(result.content[0].text, /Cursor:/);
	assert.doesNotMatch(result.content[0].text, /Background safety:/);
});

test("formatBatchResult summarizes per-action results", () => {
	const result = formatBatchResult({
		results: [
			{ index: 0, action: "press_key", ok: true, status: "success", classification: "success", route: "POST /v1/press_key" },
			{ index: 1, action: "type_text", ok: false, status: "failed", classification: "verifier_ambiguous", route: "POST /v1/type_text" },
		],
	});
	assert.equal(result.details.kind, "computer_actions");
	assert.equal(result.details.count, 2);
	assert.equal(result.details.ok, false);
	assert.match(result.content[0].text, /1\. press_key \[POST \/v1\/press_key\] -> ok \(success\)/);
	assert.match(result.content[0].text, /2\. type_text \[POST \/v1\/type_text\] -> failed \(verifier_ambiguous\)/);
});

test("formatBatchResult surfaces a transport error and a lock-release warning when both fail", () => {
	const transport = Object.assign(new Error("sidecar offline"), { code: "connection_refused", status: 0 });
	const result = formatBatchResult({
		results: [{ index: 0, action: "press_key", ok: false, status: "failed", route: "POST /v1/press_key" }],
		transportError: transport,
		lockReleaseError: "lock file vanished",
	});
	assert.equal(result.details.ok, false);
	assert.equal(result.details.lockReleaseError, "lock file vanished");
	assert.match(result.content[0].text, /Transport error:/);
	assert.match(result.content[0].text, /sidecar offline \(connection_refused\)/);
	assert.match(result.content[0].text, /Warning: action completed, but the local action lock could not be released: lock file vanished/);
});
