import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
	formatActionResult,
	formatGetWindowStateResult,
	formatListAppsResult,
	formatListWindowsResult,
	formatRoutesResult,
	formatStatusResult,
} from "../results.ts";
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
					imageBase64: Buffer.from("fake").toString("base64"),
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
});

test("window state only attaches screenshot paths under the BCU temp root", async () => {
	const tmpRoot = path.join((process.env.TMPDIR ?? os.tmpdir()).replace(/\/+$/, ""), "background-computer-use", "captures");
	await fs.mkdir(tmpRoot, { recursive: true });
	const imagePath = path.join(tmpRoot, `test-${Date.now()}.png`);
	await fs.writeFile(imagePath, Buffer.from("fake"));
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
