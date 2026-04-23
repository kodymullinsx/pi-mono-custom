import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(__dirname, "..");
const customTypePrefix = "custom-compaction/";

function getGlobalPiRoot() {
	const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
	return path.join(globalRoot, "@mariozechner", "pi-coding-agent");
}

async function createTsImporter() {
	const piRoot = getGlobalPiRoot();
	const jitiPath = pathToFileURL(
		path.join(piRoot, "node_modules", "@mariozechner", "jiti", "lib", "jiti.mjs"),
	).href;
	const { default: createJiti } = await import(jitiPath);
	const jiti = createJiti(import.meta.url, { moduleCache: false });
	return (relativePath) => jiti.import(path.join(extensionRoot, relativePath));
}

const importTs = await createTsImporter();

const artifactIndexModule = await importTs("artifact-index.ts");
const contextShapingModule = await importTs("context-shaping.ts");
const payloadCaptureModule = await importTs("payload-capture.ts");
const summaryInputModule = await importTs("summary-input.ts");

function createStandardMessage(role, text, timestamp = 1) {
	return {
		role,
		content: [{ type: "text", text }],
		timestamp,
	};
}

test("shapeContextMessages keeps true no-op passes as the original array", () => {
	const messages = [
		createStandardMessage("user", "Keep this", 1),
		{
			role: "custom",
			customType: "another-extension/helper",
			content: "Visible to other extension",
			display: false,
			timestamp: 2,
		},
		{
			role: "custom",
			customType: `${customTypePrefix}visible`,
			content: "Still visible",
			display: true,
			timestamp: 3,
		},
	];

	const shaped = contextShapingModule.shapeContextMessages(messages, customTypePrefix);
	assert.strictEqual(shaped, messages);
});

test("shapeContextMessages removes only hidden extension-owned messages", () => {
	const messages = [
		createStandardMessage("user", "Keep this", 1),
		{
			role: "custom",
			customType: `${customTypePrefix}helper`,
			content: "Drop this helper",
			display: false,
			timestamp: 2,
		},
		createStandardMessage("assistant", "Keep this too", 3),
	];

	const shaped = contextShapingModule.shapeContextMessages(messages, customTypePrefix);
	assert.notStrictEqual(shaped, messages);
	assert.deepEqual(shaped, [messages[0], messages[2]]);

	const validation = contextShapingModule.validateContextShapeChange(messages, shaped, customTypePrefix);
	assert.deepEqual(validation, { valid: true, removedCount: 1 });
});

test("artifact index tracks truncation metadata and summary helpers stay deterministic", () => {
	const state = artifactIndexModule.createArtifactIndexState();
	const options = { maxEntries: 10, maxPreviewChars: 60 };

	artifactIndexModule.rememberToolExecutionStart(state, {
		toolCallId: "tool-1",
		toolName: "grep",
		args: { pattern: "TODO", path: "src", limit: 5, literal: true },
	});

	const observation = artifactIndexModule.recordToolExecutionEnd(
		state,
		{
			toolCallId: "tool-1",
			toolName: "grep",
			isError: false,
			result: {
				content: [{ type: "text", text: "src/a.ts:1: TODO first\nsrc/b.ts:2: TODO second" }],
				details: {
					truncation: { truncatedBy: "lines", outputLines: 5, totalLines: 12 },
					matchLimitReached: 5,
					linesTruncated: true,
				},
			},
		},
		options,
	);

	assert.equal(observation.toolName, "grep");
	assert.match(observation.note, /match limit reached \(5\)/);
	assert.match(observation.note, /long lines were truncated/);
	assert.match(observation.previewText, /TODO first/);

	const details = artifactIndexModule.buildArtifactDetails(state);
	assert.equal(details.version, 1);
	assert.equal(details.artifacts.length, 1);

	const restored = artifactIndexModule.createArtifactIndexState();
	artifactIndexModule.hydrateArtifactIndexFromBranchEntries(
		restored,
		[{ type: "compaction", details }],
		options,
	);
	assert.equal(artifactIndexModule.getRecentArtifactObservations(restored, 5).length, 1);

	const { readFiles, modifiedFiles } = summaryInputModule.computeFileLists({
		read: new Set(["src/a.ts", "src/a.ts", "docs/notes.md"]),
		written: new Set(["src/app.ts"]),
		edited: new Set(["src/app.ts", "src/b.ts"]),
	});
	assert.deepEqual(readFiles, ["docs/notes.md", "src/a.ts"]);
	assert.deepEqual(modifiedFiles, ["src/app.ts", "src/b.ts"]);

	const prompt = summaryInputModule.buildSummaryPromptText({
		conversationText: "user: investigate compaction",
		previousSummary: "Older summary",
		readFiles,
		modifiedFiles,
		artifacts: [observation],
	});
	assert.match(prompt, /<conversation>/);
	assert.match(prompt, /<previous-summary>/);
	assert.match(prompt, /<tool-output-observations>/);

	const summary = summaryInputModule.appendDeterministicSummarySections("## Goal\nKeep moving", {
		readFiles,
		modifiedFiles,
		artifacts: [observation],
	});
	assert.match(summary, /## Tool output notes/);
	assert.match(summary, /## File operations/);
});

test("payload comparison allows hidden extension-message removals but still flags full-payload drift", async () => {
	const captureRoot = await mkdtemp(path.join(os.tmpdir(), "custom-compaction-capture-"));

	try {
		const baselineContextMessages = [
			createStandardMessage("user", "Keep this", 1),
			{
				role: "custom",
				customType: `${customTypePrefix}helper`,
				content: "Hidden helper context",
				display: false,
				timestamp: 2,
			},
		];
		const candidateContextMessages = [createStandardMessage("user", "Keep this", 1)];
		const baselinePayloadMessages = [
			{ role: "user", content: [{ type: "text", text: "Keep this" }] },
			{ role: "user", content: [{ type: "text", text: "Hidden helper context" }] },
		];
		const candidatePayloadMessages = [{ role: "user", content: [{ type: "text", text: "Keep this" }] }];

		await payloadCaptureModule.writePayloadCaptureArtifact({
			outputDir: captureRoot,
			runLabel: "baseline",
			sequence: 1,
			sessionId: "session-1",
			contextMessages: baselineContextMessages,
			payload: { messages: baselinePayloadMessages, headers: { date: "Fri, 01 Jan 2026 00:00:00 GMT" } },
		});

		await payloadCaptureModule.writePayloadCaptureArtifact({
			outputDir: captureRoot,
			runLabel: "candidate",
			sequence: 1,
			sessionId: "session-1",
			contextMessages: candidateContextMessages,
			payload: { messages: candidatePayloadMessages, headers: { date: "Fri, 01 Jan 2026 00:00:01 GMT" } },
		});

		const comparison = await payloadCaptureModule.comparePayloadCaptureDirectories(
			path.join(captureRoot, "baseline"),
			path.join(captureRoot, "candidate"),
			customTypePrefix,
		);

		assert.equal(comparison.ok, true);
		assert.deepEqual(comparison.mismatches, []);
		assert.deepEqual(comparison.payloadDifferences, ["0001.json: canonicalized full payload differs"]);
	} finally {
		await rm(captureRoot, { recursive: true, force: true });
	}
});

test("writePayloadCaptureArtifact sanitizes run labels and the live hook path writes capture artifacts", async () => {
	const captureRoot = await mkdtemp(path.join(os.tmpdir(), "custom-compaction-live-capture-"));
	const previousCaptureDir = process.env.PI_CUSTOM_COMPACTION_CAPTURE_DIR;
	const previousCaptureRun = process.env.PI_CUSTOM_COMPACTION_CAPTURE_RUN;

	try {
		const sanitizedPath = await payloadCaptureModule.writePayloadCaptureArtifact({
			outputDir: captureRoot,
			runLabel: "../unsafe/run",
			sequence: 1,
			contextMessages: [createStandardMessage("user", "Keep this", 1)],
			payload: { messages: [{ role: "user", content: [{ type: "text", text: "Keep this" }] }] },
		});
		assert.match(sanitizedPath, /unsafe-run\/0001\.json$/);
		assert.ok(sanitizedPath.startsWith(captureRoot));

		process.env.PI_CUSTOM_COMPACTION_CAPTURE_DIR = captureRoot;
		process.env.PI_CUSTOM_COMPACTION_CAPTURE_RUN = "live-hook";

		const piRoot = getGlobalPiRoot();
		const { loadExtensions } = await import(pathToFileURL(path.join(piRoot, "dist", "core", "extensions", "loader.js")).href);
		const { extensions, errors } = await loadExtensions([extensionRoot], process.cwd());

		assert.deepEqual(errors, []);
		const contextHandler = extensions[0].handlers.get("context")?.[0];
		const beforeProviderRequestHandler = extensions[0].handlers.get("before_provider_request")?.[0];
		assert.equal(typeof contextHandler, "function");
		assert.equal(typeof beforeProviderRequestHandler, "function");

		const messages = [createStandardMessage("user", "Live hook capture", 1)];
		await contextHandler({ type: "context", messages }, {});
		await beforeProviderRequestHandler(
			{
				type: "before_provider_request",
				payload: {
					messages: [{ role: "user", content: [{ type: "text", text: "Live hook capture" }] }],
					meta: { request_id: "volatile-id" },
				},
			},
			{
				sessionManager: {
					getSessionId() {
						return "session-live";
					},
					getSessionFile() {
						return "/tmp/live-session.jsonl";
					},
				},
			},
		);

		const artifact = await payloadCaptureModule.readPayloadCaptureArtifact(path.join(captureRoot, "live-hook", "0001.json"));
		assert.equal(artifact.runLabel, "live-hook");
		assert.equal(artifact.payloadMessages.length, 1);
		assert.deepEqual(artifact.payloadMessages[0], {
			role: "user",
			content: [{ type: "text", text: "Live hook capture" }],
		});
		assert.equal(artifact.payload.meta.request_id, undefined);
	} finally {
		if (previousCaptureDir === undefined) delete process.env.PI_CUSTOM_COMPACTION_CAPTURE_DIR;
		else process.env.PI_CUSTOM_COMPACTION_CAPTURE_DIR = previousCaptureDir;

		if (previousCaptureRun === undefined) delete process.env.PI_CUSTOM_COMPACTION_CAPTURE_RUN;
		else process.env.PI_CUSTOM_COMPACTION_CAPTURE_RUN = previousCaptureRun;

		await rm(captureRoot, { recursive: true, force: true });
	}
});

test("extension loads through Pi's extension loader and falls back cleanly when no summary model is configured", async () => {
	const piRoot = getGlobalPiRoot();
	const { loadExtensions } = await import(pathToFileURL(path.join(piRoot, "dist", "core", "extensions", "loader.js")).href);
	const { extensions, errors } = await loadExtensions([extensionRoot], process.cwd());

	assert.deepEqual(errors, []);
	assert.equal(extensions.length, 1);

	const handler = extensions[0].handlers.get("session_before_compact")?.[0];
	assert.equal(typeof handler, "function");

	const notifications = [];
	const result = await handler(
		{
			type: "session_before_compact",
			signal: new AbortController().signal,
			branchEntries: [],
			preparation: {
				messagesToSummarize: [createStandardMessage("user", "Investigate compaction", 1)],
				turnPrefixMessages: [],
				tokensBefore: 12000,
				firstKeptEntryId: "entry-42",
				previousSummary: "Earlier work",
				fileOps: {
					read: new Set(["src/app.ts"]),
					written: new Set(),
					edited: new Set(),
				},
			},
		},
		{
			ui: {
				notify(message, level) {
					notifications.push({ message, level });
				},
			},
			modelRegistry: {
				find() {
					return undefined;
				},
			},
		},
	);

	assert.equal(result, undefined);
	assert.equal(notifications.length, 1);
	assert.match(notifications[0].message, /using default compaction/i);
});
