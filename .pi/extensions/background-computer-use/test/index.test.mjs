import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Check } from "typebox/value";

import { registerBackgroundComputerUseExtension } from "../index.ts";
import { clearActionApprovals, confirmActionToolCall, consumeActionApproval } from "../confirmation.ts";
import { REQUIRED_PHASE1_ROUTES, SUPPORTED_CONTRACT_VERSION } from "../config.ts";
import { recordStateCapture } from "../refs.ts";

async function withTempDir(fn) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "bcu-index-"));
	try {
		return await fn(root);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
}

async function withEnv(values, fn) {
	const previous = new Map();
	for (const key of Object.keys(values)) {
		previous.set(key, process.env[key]);
		const value = values[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	try {
		return await fn();
	} finally {
		for (const [key, value] of previous) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

async function withServer(handler, fn) {
	const server = http.createServer(handler);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert.equal(typeof address, "object");
	const baseURL = `http://127.0.0.1:${address.port}`;
	try {
		return await fn(baseURL);
	} finally {
		await new Promise((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});
	}
}

function json(res, statusCode, body) {
	const data = JSON.stringify(body);
	res.writeHead(statusCode, {
		"content-type": "application/json",
		"content-length": Buffer.byteLength(data),
	});
	res.end(data);
}

async function readBody(req) {
	let raw = "";
	for await (const chunk of req) raw += chunk;
	return raw.length ? JSON.parse(raw) : {};
}

function routeSummaries() {
	return REQUIRED_PHASE1_ROUTES.map((route) => ({
		id: route.id,
		method: route.method,
		path: route.path,
		category: "test",
		summary: route.id,
	}));
}

function bootstrap(baseURL, overrides = {}) {
	return {
		contractVersion: SUPPORTED_CONTRACT_VERSION,
		baseURL,
		instanceID: "test-instance",
		authorizationToken: "test-authorization-token",
		capabilities: { observe: true, action: true },
		startedAt: "2026-04-25T01:00:00Z",
		permissions: {
			accessibility: { granted: true, promptable: true },
			screenRecording: { granted: true, promptable: true },
		},
		instructions: { ready: true, summary: "ready", agent: [], user: [] },
		routes: routeSummaries(),
		...overrides,
	};
}

async function writeManifest(root, baseURL, overrides = {}) {
	const manifestPath = path.join(root, "runtime-manifest.json");
	await fs.writeFile(manifestPath, JSON.stringify({ ...bootstrap(baseURL), routes: routeSummaries(), ...overrides }), { mode: 0o600 });
	return manifestPath;
}

function registerTools(
	checkActionSession = async () => ({ allowed: true, summary: "test console session", reasons: [] }),
	approvalConsumer = () => ({ ok: true }),
) {
	const tools = new Map();
	registerBackgroundComputerUseExtension({
		on() {},
		registerTool(tool) {
			tools.set(tool.name, tool);
		},
		registerCommand() {},
	}, {
		checkActionSession,
		consumeActionApproval: approvalConsumer,
	});
	return tools;
}

function seedStateToken(token, window = "win") {
	recordStateCapture({ windowId: window, stateToken: token, target: { appName: "TextEdit", windowTitle: "Test" }, ttlMs: 60_000 });
}

function createHandler(baseURL, posts, overrides = {}) {
	return async (req, res) => {
		const url = new URL(req.url ?? "/", baseURL);
		if (req.method === "GET" && url.pathname === "/health") {
			json(res, 200, { ok: true, contractVersion: SUPPORTED_CONTRACT_VERSION });
			return;
		}
		if (req.method === "GET" && url.pathname === "/v1/bootstrap") {
			const bootstrapOverride = typeof overrides.bootstrap === "function" ? overrides.bootstrap() : overrides.bootstrap;
			json(res, 200, bootstrap(baseURL, bootstrapOverride));
			return;
		}
		if (req.method === "GET" && url.pathname === "/v1/routes") {
			json(res, 200, { contractVersion: SUPPORTED_CONTRACT_VERSION, routes: routeSummaries() });
			return;
		}
		if (req.method === "POST") {
			const body = await readBody(req);
			posts.push({ path: url.pathname, body });
			const override = overrides[url.pathname];
			if (override) {
				json(res, override.statusCode, override.body);
				return;
			}
			if (url.pathname === "/v1/list_windows") {
				json(res, 200, {
					contractVersion: SUPPORTED_CONTRACT_VERSION,
					app: { name: "TextEdit" },
					windows: [
						{ windowID: "win-1", title: "Untitled", isFocused: true, isMain: true, isOnScreen: true },
						{ windowID: "win-2", title: "Scratch", isFocused: false, isMain: false, isOnScreen: true },
					],
				});
				return;
			}
			if (url.pathname === "/v1/get_window_state") {
				json(res, 200, {
					contractVersion: SUPPORTED_CONTRACT_VERSION,
					stateToken: `state-${posts.length}`,
					window: { windowID: body.window, title: "Test" },
					screenshot: { status: body.imageMode === "omit" ? "omitted" : "ok" },
					tree: { nodes: [{ index: 0 }, { index: 3 }, { index: 7 }] },
					focusedElement: { index: 0 },
					backgroundSafety: {},
					performance: { totalMs: 1 },
					notes: [],
				});
				return;
			}
			if (url.pathname === "/v1/drag" || url.pathname === "/v1/resize" || url.pathname === "/v1/set_window_frame") {
				const frameX = url.pathname === "/v1/set_window_frame" ? (body.x ?? 0) : (body.toX ?? 0);
				const frameY = url.pathname === "/v1/set_window_frame" ? (body.y ?? 0) : (body.toY ?? 0);
				json(res, 200, {
					contractVersion: SUPPORTED_CONTRACT_VERSION,
					ok: true,
					cursor: { position: { x: frameX, y: frameY } },
					window: { frame: { x: frameX, y: frameY, width: body.width ?? 800, height: body.height ?? 600 } },
					backgroundSafety: { safe: true, reason: "on-screen" },
				});
				return;
			}
			json(res, 200, {
				contractVersion: SUPPORTED_CONTRACT_VERSION,
				ok: true,
				classification: "success",
				summary: "Action accepted.",
				window: { windowID: body.window },
				preStateToken: body.stateToken ?? null,
				postStateToken: `post-state-${posts.length}`,
				warnings: [],
				verification: {},
			});
			return;
		}
		json(res, 404, { ok: false, message: "missing" });
	};
}

test("get_window_state profiles expand to request defaults without changing no-profile behavior", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv({ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_OBSERVATION: "1", BCU_ENABLE_ACTIONS: undefined }, async () => {
				const tool = registerTools().get("bcu_get_window_state");
				await tool.execute("call-1", { window: "win-1" });
				await tool.execute("call-2", { window: "win-2", profile: "fast_visual" });
				await tool.execute("call-3", { window: "win-3", profile: "semantic" });
				await tool.execute("call-4", { window: "win-4", profile: "fast_visual", imageMode: "omit", maxNodes: 12 });
				await tool.execute("call-5", { window: "win-5", profile: "full_debug" });
			});
		});

		assert.deepEqual(posts.map((post) => post.body), [
			{ window: "win-1", imageMode: "base64" },
			{ window: "win-2", imageMode: "base64", maxNodes: 50 },
			{ window: "win-3", imageMode: "omit", maxNodes: 500 },
			{ window: "win-4", imageMode: "omit", maxNodes: 12 },
			{
				window: "win-5",
				imageMode: "base64",
				debugMode: "full",
				debug: true,
				includeDiagnostics: true,
				includePlatformProfile: true,
				includeRawCapture: true,
				includeSemanticTree: true,
				includeProjectedTree: true,
			},
		]);
	});
});

test("action tools are registered behind the action flag and build route bodies", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv(
				{
					BCU_MANIFEST_PATH: manifestPath,
					BCU_ENABLE_OBSERVATION: "1",
					BCU_ENABLE_ACTIONS: "1",
					BCU_ACTION_LOCK_PATH: path.join(root, "action.lock"),
				},
				async () => {
					const tools = registerTools();
					assert.equal(tools.has("bcu_scroll"), true);
					assert.equal(tools.has("bcu_type_text"), true);
					assert.equal(tools.has("bcu_set_value"), true);
					assert.equal(tools.has("bcu_perform_secondary_action"), true);
					assert.equal(tools.has("bcu_start"), false);
					for (const [toolName, baseParams] of [
						["bcu_scroll", { window: "win", stateToken: "schema-scroll", direction: "down" }],
						["bcu_set_value", { window: "win", stateToken: "schema-value", value: "value" }],
						["bcu_perform_secondary_action", { window: "win", stateToken: "schema-secondary", action: "Close" }],
					]) {
						const schema = tools.get(toolName).parameters;
						assert.equal(Check(schema, { ...baseParams, elementIndex: 1 }), true, `${toolName} accepts elementIndex`);
						assert.equal(Check(schema, { ...baseParams, elementRef: "@e1" }), true, `${toolName} accepts elementRef`);
						assert.equal(Check(schema, baseParams), false, `${toolName} rejects a missing element target`);
						assert.equal(Check(schema, { ...baseParams, elementIndex: 1, elementRef: "@e1" }), false, `${toolName} rejects both element targets`);
					}

					seedStateToken("state-1");
					await tools.get("bcu_scroll").execute("call-1", {
						window: "win",
						stateToken: "state-1",
						elementIndex: 2,
						direction: "down",
						pages: 1,
						verificationMode: "fast",
						imageMode: "path",
					});
					seedStateToken("state-2");
					await tools.get("bcu_type_text").execute("call-2", {
						window: "win",
						stateToken: "state-2",
						elementIndex: 3,
						text: "hello",
						focusAssistMode: "focus_and_caret_end",
					});
					seedStateToken("state-3");
					await tools.get("bcu_set_value").execute("call-3", { window: "win", stateToken: "state-3", elementIndex: 4, value: "value" });
					seedStateToken("state-4");
					await tools.get("bcu_perform_secondary_action").execute("call-4", {
						window: "win",
						stateToken: "state-4",
						elementIndex: 5,
						action: "Close",
						actionID: "close-1",
						menuPath: ["File"],
						webTraversal: "visible",
					});
				},
			);
		});

		assert.deepEqual(posts.map((post) => ({ path: post.path, body: post.body })), [
			{
				path: "/v1/scroll",
				body: {
					window: "win",
						stateToken: "state-1",
					imageMode: "path",
					target: { kind: "display_index", value: 2 },
					direction: "down",
					pages: 1,
					verificationMode: "fast",
				},
			},
			{
				path: "/v1/type_text",
					body: { window: "win", stateToken: "state-2", target: { kind: "display_index", value: 3 }, text: "hello", focusAssistMode: "focus_and_caret_end" },
			},
				{ path: "/v1/set_value", body: { window: "win", stateToken: "state-3", target: { kind: "display_index", value: 4 }, value: "value" } },
			{
				path: "/v1/perform_secondary_action",
				body: {
					window: "win",
					stateToken: "state-4",
					target: { kind: "display_index", value: 5 },
					action: "Close",
					actionID: "close-1",
					menuPath: ["File"],
					webTraversal: "visible",
				},
			},
		]);
	});
});

test("action lock blocks actions before posting and releases after failures", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer(
			(req, res) =>
				createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts, {
					"/v1/press_key": { statusCode: 200, body: { ok: false, classification: "effect_not_verified", summary: "No effect.", warnings: [] } },
					"/v1/type_text": { statusCode: 500, body: { ok: false, message: "failed" } },
				})(req, res),
			async (baseURL) => {
				const manifestPath = await writeManifest(root, baseURL);
				const lockPath = path.join(root, "action.lock");
				await withEnv(
					{
						BCU_MANIFEST_PATH: manifestPath,
						BCU_ENABLE_OBSERVATION: "1",
						BCU_ENABLE_ACTIONS: "1",
						BCU_ACTION_LOCK_PATH: lockPath,
					},
					async () => {
						const tools = registerTools();
						const abortController = new AbortController();
						abortController.abort();
						const aborted = await tools.get("bcu_press_key").execute("aborted", { window: "win", stateToken: "aborted", key: "return" }, abortController.signal);
						assert.equal(aborted.details.ok, false);
						await assert.rejects(fs.access(lockPath));

						seedStateToken("state-ok");
						const okFalse = await tools.get("bcu_press_key").execute("call-1", { window: "win", stateToken: "state-ok", key: "return" });
						assert.equal(okFalse.details.ok, false);
						await assert.rejects(fs.access(lockPath));

						seedStateToken("state-fail");
						const failure = await tools.get("bcu_type_text").execute("call-2", { window: "win", stateToken: "state-fail", text: "hello" });
						assert.equal(failure.details.ok, false);
						await assert.rejects(fs.access(lockPath));

						await fs.writeFile(
							lockPath,
							JSON.stringify({
								ownerId: "other-session",
								pid: 999,
								createdAt: new Date().toISOString(),
								expiresAt: new Date(Date.now() + 30_000).toISOString(),
							}),
						);
						seedStateToken("state-blocked");
						const blocked = await tools.get("bcu_set_value").execute("call-3", { window: "win", stateToken: "state-blocked", elementIndex: 1, value: "x" });
						assert.equal(blocked.details.kind, "action_lock");
						assert.equal(posts.some((post) => post.path === "/v1/set_value"), false);
					},
				);
			},
		);
	});
});

test("capture and all individual motion tools are registered, while batch is absent", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv(
				{
					BCU_MANIFEST_PATH: manifestPath,
					BCU_ENABLE_OBSERVATION: "1",
					BCU_ENABLE_ACTIONS: "1",
					BCU_ACTION_LOCK_PATH: path.join(root, "action.lock"),
				},
				async () => {
					const tools = registerTools();
					assert.equal(tools.has("bcu_capture"), true, "bcu_capture is always registered");
					assert.equal(tools.has("bcu_move_window"), true);
					assert.equal(tools.has("bcu_set_window_frame"), true);
					assert.equal(tools.has("bcu_resize"), true);
					assert.equal(tools.has("bcu_computer_actions"), false);
				},
			);
		});
	});
});

test("model startup stays removed while observe/action capabilities default on and support independent opt-out", async () => {
	await withEnv({ BCU_ENABLE_OBSERVATION: undefined, BCU_ENABLE_ACTIONS: undefined }, async () => {
		const tools = registerTools();
		assert.equal(tools.has("bcu_start"), false);
		assert.equal(tools.has("bcu_computer_actions"), false);
		for (const observationTool of ["bcu_list_apps", "bcu_list_windows", "bcu_get_window_state", "bcu_capture"]) {
			assert.equal(tools.has(observationTool), true, `${observationTool} should default on`);
		}
		for (const actionTool of [
			"bcu_press_key",
			"bcu_click",
			"bcu_scroll",
			"bcu_type_text",
			"bcu_set_value",
			"bcu_perform_secondary_action",
			"bcu_move_window",
			"bcu_set_window_frame",
			"bcu_resize",
		]) {
			assert.equal(tools.has(actionTool), true, `${actionTool} should default on`);
		}
		assert.equal(tools.has("bcu_computer_actions"), false);
	});
	await withEnv({ BCU_ENABLE_OBSERVATION: "1", BCU_ENABLE_ACTIONS: "0" }, async () => {
		const tools = registerTools();
		assert.equal(tools.has("bcu_capture"), true);
		assert.equal(tools.has("bcu_press_key"), false);
	});
	await withEnv({ BCU_ENABLE_OBSERVATION: "false", BCU_ENABLE_ACTIONS: "1" }, async () => {
		const tools = registerTools();
		assert.equal(tools.has("bcu_capture"), false);
		assert.equal(tools.has("bcu_press_key"), true);
		assert.equal(tools.has("bcu_computer_actions"), false);
	});
	await withEnv({ BCU_ENABLE_OBSERVATION: "1", BCU_ENABLE_ACTIONS: "1" }, async () => {
		const tools = registerTools();
		assert.equal(tools.has("bcu_capture"), true);
		assert.equal(tools.has("bcu_press_key"), true);
		assert.equal(tools.has("bcu_start"), false);
		assert.equal(tools.has("bcu_computer_actions"), false);
	});
});

test("standalone actions reject missing, replayed, sensitive, and unsafe-session mutations before dispatch", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv(
				{ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_ACTIONS: "1", BCU_ACTION_LOCK_PATH: path.join(root, "action.lock") },
				async () => {
					const tools = registerTools();
					const missing = await tools.get("bcu_press_key").execute("missing", { window: "win", key: "return" });
					assert.equal(missing.details.kind, "state_token");
					assert.equal(missing.details.reason, "missing");

					seedStateToken("single-use");
					const first = await tools.get("bcu_press_key").execute("first", { window: "win", stateToken: "single-use", key: "return" });
					assert.equal(first.details.ok, true);
					const replay = await tools.get("bcu_press_key").execute("replay", { window: "win", stateToken: "single-use", key: "return" });
					assert.equal(replay.details.reason, "replayed");

					recordStateCapture({ windowId: "win", stateToken: "sensitive", target: { bundleId: "com.1password.1password" }, ttlMs: 60_000 });
					const sensitive = await tools.get("bcu_press_key").execute("sensitive", { window: "win", stateToken: "sensitive", key: "return" });
					assert.equal(sensitive.details.kind, "sensitive_target");

					seedStateToken("both-targets");
					const both = await tools.get("bcu_press_key").execute("both", {
						window: "win",
						windowRef: "@w1",
						stateToken: "both-targets",
						key: "return",
					});
					assert.equal(both.details.kind, "validation");
					assert.match(both.content[0].text, /exactly one/);

					const deniedTools = registerTools(async () => ({
						allowed: false,
						summary: "screen locked",
						reasons: ["the screen is locked"],
					}));
					seedStateToken("locked");
					const locked = await deniedTools.get("bcu_press_key").execute("locked", { window: "win", stateToken: "locked", key: "return" });
					assert.equal(locked.details.kind, "session_precondition");

					assert.equal(posts.filter((post) => post.path === "/v1/press_key").length, 1);
				},
			);
		});
	});
});

test("action execute reaches final confirmation and rejects nested post-preflight mutation before dispatch", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv({
				BCU_MANIFEST_PATH: manifestPath,
				BCU_ENABLE_ACTIONS: "1",
				BCU_ACTION_LOCK_PATH: path.join(root, "action.lock"),
			}, async () => {
				const tools = registerTools(undefined, consumeActionApproval);
				const params = { window: "win", stateToken: "state-approved", key: "return", cursor: { name: "before" } };
				await confirmActionToolCall(
					{ toolCallId: "approved", toolName: "bcu_press_key", input: params },
					{ mode: "tui", hasUI: true, ui: { confirm: async () => true } },
				);
				await Promise.resolve();
				params.cursor.name = "after";
				seedStateToken("state-approved");
				const rejected = await tools.get("bcu_press_key").execute("approved", params);
				assert.equal(rejected.details.kind, "confirmation");
				assert.equal(rejected.details.reason, "mismatch");
				assert.equal(posts.length, 0);
			});
		});
	});
});

test("registered confirmation and action handlers dispatch an immutable snapshot across async checks", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv({
				BCU_MANIFEST_PATH: manifestPath,
				BCU_ENABLE_ACTIONS: "1",
				BCU_ACTION_LOCK_PATH: path.join(root, "action.lock"),
			}, async () => {
				clearActionApprovals();
				const tools = new Map();
				const handlers = new Map();
				let releaseSessionCheck;
				let sessionCheckStarted;
				const sessionCheckStartedPromise = new Promise((resolve) => {
					sessionCheckStarted = resolve;
				});
				const sessionCheckReleasePromise = new Promise((resolve) => {
					releaseSessionCheck = resolve;
				});
				registerBackgroundComputerUseExtension({
					on(event, handler) {
						const registered = handlers.get(event) ?? [];
						registered.push(handler);
						handlers.set(event, registered);
					},
					registerTool(tool) {
						tools.set(tool.name, tool);
					},
					registerCommand() {},
				}, {
					checkActionSession: async () => {
						sessionCheckStarted();
						await sessionCheckReleasePromise;
						return { allowed: true, summary: "test console session", reasons: [] };
					},
					consumeActionApproval,
				});

				const params = {
					window: "win",
					stateToken: "nested-mutation",
					elementIndex: 3,
					cursor: { id: "cursor-1", name: "before", color: "#112233" },
				};
				const confirmationHandler = handlers.get("tool_call")[0];
				await confirmationHandler(
					{ toolCallId: "nested-approved", toolName: "bcu_click", input: params },
					{ mode: "tui", hasUI: true, ui: { confirm: async () => true } },
				);
				seedStateToken("nested-mutation");
				const executing = tools.get("bcu_click").execute("nested-approved", params);
				await sessionCheckStartedPromise;
				params.cursor.name = "after";
				releaseSessionCheck();
				const result = await executing;

				assert.equal(result.details.ok, true);
				assert.equal(posts.length, 1);
				assert.deepEqual(posts[0].body.cursor, { id: "cursor-1", name: "before", color: "#112233" });
			});
		});
	});
});

test("observation filters sensitive apps and denies sensitive capture targets", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer(
			(req, res) =>
				createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts, {
					"/v1/list_apps": {
						statusCode: 200,
						body: {
							frontmostApp: { name: "1Password", bundleID: "com.1password.1password" },
							runningApps: [
								{ name: "1Password", bundleID: "com.1password.1password" },
								{ name: "TextEdit", bundleID: "com.apple.TextEdit" },
							],
						},
					},
					"/v1/list_windows": {
						statusCode: 200,
						body: {
							app: { name: "1Password", bundleID: "com.1password.1password" },
							windows: [{ windowID: "secret", title: "Passwords", isFocused: true }],
						},
					},
				})(req, res),
			async (baseURL) => {
				const manifestPath = await writeManifest(root, baseURL);
				await withEnv({ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_OBSERVATION: "1" }, async () => {
					const tools = registerTools();
					const apps = await tools.get("bcu_list_apps").execute("apps", {});
					assert.doesNotMatch(apps.content[0].text, /1Password/);
					assert.match(apps.content[0].text, /TextEdit/);
					const capture = await tools.get("bcu_capture").execute("capture", { app: "TextEdit" });
					assert.equal(capture.details.kind, "sensitive_target");
					assert.equal(posts.some((post) => post.path === "/v1/get_window_state"), false);
				});
			},
		);
	});
});



test("sidecar startedAt changes invalidate prior tokens and refs", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		let runtimeStartedAt = "2026-04-25T01:00:00Z";
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts, {
			bootstrap: () => ({ startedAt: runtimeStartedAt }),
		})(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL, { startedAt: "2026-04-25T01:00:00Z" });
			await withEnv(
				{ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_OBSERVATION: "1", BCU_ENABLE_ACTIONS: "1", BCU_ACTION_LOCK_PATH: path.join(root, "action.lock") },
				async () => {
					const tools = registerTools();
					const capture = await tools.get("bcu_capture").execute("capture-before-restart", { app: "TextEdit" });
					assert.equal(capture.details.ok, true);
					runtimeStartedAt = "2026-04-25T01:05:00Z";
					await writeManifest(root, baseURL, { startedAt: "2026-04-25T01:05:00Z" });

					const staleToken = await tools.get("bcu_press_key").execute("after-restart", {
						window: "win-1",
						stateToken: capture.details.stateToken,
						key: "return",
					});
					assert.equal(staleToken.details.kind, "state_token");
					assert.equal(staleToken.details.reason, "stale");

					const staleRef = await tools.get("bcu_press_key").execute("stale-ref-after-restart", {
						windowRef: "@w1",
						stateToken: capture.details.stateToken,
						key: "return",
					});
					assert.equal(staleRef.details.kind, "stale_ref");
					assert.equal(posts.some((post) => post.path === "/v1/press_key"), false);
				},
			);
		});
	});
});

test("sidecar instanceID changes invalidate prior tokens and refs", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		let runtimeInstanceID = "test-instance";
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts, {
			bootstrap: () => ({ instanceID: runtimeInstanceID }),
		})(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL, { instanceID: runtimeInstanceID });
			await withEnv(
				{ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_OBSERVATION: "1", BCU_ENABLE_ACTIONS: "1", BCU_ACTION_LOCK_PATH: path.join(root, "action.lock") },
				async () => {
					const tools = registerTools();
					const capture = await tools.get("bcu_capture").execute("capture-before-instance-rotation", { app: "TextEdit" });
					assert.equal(capture.details.ok, true);
					runtimeInstanceID = "rotated-instance";
					await writeManifest(root, baseURL, { instanceID: runtimeInstanceID });

					const staleToken = await tools.get("bcu_press_key").execute("after-instance-rotation", {
						window: "win-1",
						stateToken: capture.details.stateToken,
						key: "return",
					});
					assert.equal(staleToken.details.kind, "state_token");
					assert.equal(staleToken.details.reason, "stale");

					const staleRef = await tools.get("bcu_press_key").execute("stale-ref-after-instance-rotation", {
						windowRef: "@w1",
						stateToken: capture.details.stateToken,
						key: "return",
					});
					assert.equal(staleRef.details.kind, "stale_ref");
					assert.equal(posts.some((post) => post.path === "/v1/press_key"), false);
				},
			);
		});
	});
});

test("state reads and captures without a stateToken fail at the observation boundary", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer(
			(req, res) =>
				createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts, {
					"/v1/get_window_state": {
						statusCode: 200,
						body: { window: { windowID: "win-1", title: "No token" }, screenshot: { status: "omitted" }, tree: { nodes: [{ index: 0 }] } },
					},
				})(req, res),
			async (baseURL) => {
				const manifestPath = await writeManifest(root, baseURL);
				await withEnv({ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_OBSERVATION: "1" }, async () => {
					const tools = registerTools();
					const read = await tools.get("bcu_get_window_state").execute("read-without-token", { window: "win-1" });
					assert.equal(read.details.ok, false);
					assert.equal(read.details.kind, "state_token");
					assert.equal(read.details.reason, "missing");

					const capture = await tools.get("bcu_capture").execute("capture-without-token", { app: "TextEdit" });
					assert.equal(capture.details.ok, false);
					assert.equal(capture.details.kind, "state_token");
					assert.equal(capture.details.reason, "missing");
					assert.equal(capture.details.refs, undefined);
				});
			},
		);
	});
});



test("bcu_capture lists windows, picks the focused window, and mints @wN / @eN refs", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv({ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_OBSERVATION: "1" }, async () => {
				const tool = registerTools().get("bcu_capture");
				const result = await tool.execute("capture-1", { app: "TextEdit" });
				assert.equal(result.details.kind, "capture");
				assert.equal(result.details.windowID, "win-1");
				assert.equal(result.details.stateToken, "state-2");
				assert.deepEqual(result.details.refs, {
					windows: { "@w1": "win-1" },
					elements: { "@e1": 0, "@e2": 3, "@e3": 7 },
				});
				const paths = posts.map((post) => post.path);
				assert.ok(paths.includes("/v1/list_windows"));
				assert.ok(paths.includes("/v1/get_window_state"));
			});
		});
	});
});

test("bcu_move_window posts to /v1/drag with toX/toY and uses formatMotionActionResult", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv(
				{ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_OBSERVATION: "1", BCU_ENABLE_ACTIONS: "1", BCU_ACTION_LOCK_PATH: path.join(root, "action.lock") },
				async () => {
					const tools = registerTools();
					seedStateToken("state-1", "win-1");
					const result = await tools.get("bcu_move_window").execute("move-1", {
						window: "win-1",
						stateToken: "state-1",
						toX: 100,
						toY: 200,
					});
					assert.equal(result.details.kind, "motion");
					assert.equal(result.details.action, "move_window");
					assert.match(result.content[0].text, /Window frame: x=100 y=200/);
					const drag = posts.find((post) => post.path === "/v1/drag");
					assert.ok(drag, "POST /v1/drag should be sent");
					assert.equal(drag.body.toX, 100);
					assert.equal(drag.body.toY, 200);
					assert.equal(drag.body.window, "win-1");
				},
			);
		});
	});
});

test("bcu_resize posts to /v1/resize with the named handle and point coordinates", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv(
				{ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_OBSERVATION: "1", BCU_ENABLE_ACTIONS: "1", BCU_ACTION_LOCK_PATH: path.join(root, "action.lock") },
				async () => {
					const tools = registerTools();
					seedStateToken("state-1", "win-1");
					await tools.get("bcu_resize").execute("resize-1", {
						window: "win-1",
						stateToken: "state-1",
						handle: "se",
						toX: 1200,
						toY: 800,
					});
					const resize = posts.find((post) => post.path === "/v1/resize");
					assert.ok(resize, "POST /v1/resize should be sent");
					assert.equal(resize.body.handle, "se");
					assert.equal(resize.body.toX, 1200);
					assert.equal(resize.body.toY, 800);
				},
			);
		});
	});
});

test("bcu_set_window_frame posts to /v1/set_window_frame with x/y/width/height", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv(
				{ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_OBSERVATION: "1", BCU_ENABLE_ACTIONS: "1", BCU_ACTION_LOCK_PATH: path.join(root, "action.lock") },
				async () => {
					const tools = registerTools();
					seedStateToken("state-1", "win-1");
					await tools.get("bcu_set_window_frame").execute("frame-1", {
						window: "win-1",
						stateToken: "state-1",
						x: 10,
						y: 20,
						width: 1024,
						height: 768,
						animate: true,
					});
					const frame = posts.find((post) => post.path === "/v1/set_window_frame");
					assert.ok(frame, "POST /v1/set_window_frame should be sent");
					assert.equal(frame.body.x, 10);
					assert.equal(frame.body.y, 20);
					assert.equal(frame.body.width, 1024);
					assert.equal(frame.body.height, 768);
					assert.equal(frame.body.animate, true);
				},
			);
		});
	});
});


test("all nine action tools emit the exact authenticated Swift request shapes", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv({
				BCU_MANIFEST_PATH: manifestPath,
				BCU_ENABLE_ACTIONS: "1",
				BCU_ACTION_LOCK_PATH: path.join(root, "action.lock"),
			}, async () => {
				const tools = registerTools();
				const calls = [
					["bcu_click", { window: "win", stateToken: "s1", elementIndex: 1, clickCount: 1 }],
					["bcu_scroll", { window: "win", stateToken: "s2", elementIndex: 2, direction: "down" }],
					["bcu_perform_secondary_action", { window: "win", stateToken: "s3", elementIndex: 3, action: "Show menu" }],
					["bcu_move_window", { window: "win", stateToken: "s4", toX: 10, toY: 20 }],
					["bcu_resize", { window: "win", stateToken: "s5", handle: "se", toX: 900, toY: 700 }],
					["bcu_set_window_frame", { window: "win", stateToken: "s6", x: 1, y: 2, width: 800, height: 600 }],
					["bcu_type_text", { window: "win", stateToken: "s7", elementIndex: 7, text: "hello" }],
					["bcu_press_key", { window: "win", stateToken: "s8", key: "return" }],
					["bcu_set_value", { window: "win", stateToken: "s9", elementIndex: 9, value: "value" }],
				];
				for (let index = 0; index < calls.length; index += 1) {
					seedStateToken(`s${index + 1}`);
					await tools.get(calls[index][0]).execute(`wire-${index + 1}`, calls[index][1]);
				}
			});
		});

		assert.deepEqual(posts.map(({ path: requestPath, body }) => ({ path: requestPath, body })), [
			{ path: "/v1/click", body: { window: "win", stateToken: "s1", target: { kind: "display_index", value: 1 }, clickCount: 1 } },
			{ path: "/v1/scroll", body: { window: "win", stateToken: "s2", target: { kind: "display_index", value: 2 }, direction: "down" } },
			{ path: "/v1/perform_secondary_action", body: { window: "win", stateToken: "s3", target: { kind: "display_index", value: 3 }, action: "Show menu" } },
			{ path: "/v1/drag", body: { window: "win", stateToken: "s4", toX: 10, toY: 20 } },
			{ path: "/v1/resize", body: { window: "win", stateToken: "s5", handle: "se", toX: 900, toY: 700 } },
			{ path: "/v1/set_window_frame", body: { window: "win", stateToken: "s6", x: 1, y: 2, width: 800, height: 600 } },
			{ path: "/v1/type_text", body: { window: "win", stateToken: "s7", text: "hello", target: { kind: "display_index", value: 7 } } },
			{ path: "/v1/press_key", body: { window: "win", stateToken: "s8", key: "return" } },
			{ path: "/v1/set_value", body: { window: "win", stateToken: "s9", target: { kind: "display_index", value: 9 }, value: "value" } },
		]);
	});
});

test("action tools return a stale_ref result when windowRef is not in the current ref cache", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv(
				{ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_OBSERVATION: "1", BCU_ENABLE_ACTIONS: "1", BCU_ACTION_LOCK_PATH: path.join(root, "action.lock") },
				async () => {
					const tools = registerTools();
					const { clearCurrentRefs, setCurrentRefs } = await import("../refs.ts");
					clearCurrentRefs();
					setCurrentRefs({ windows: { "@w1": "win-cached" }, elements: {} }, "win-cached");
					const result = await tools.get("bcu_press_key").execute("stale-1", {
						windowRef: "@w999",
						key: "return",
					});
					assert.equal(result.details.kind, "stale_ref");
					assert.deepEqual(result.details.staleRefs, ["@w999"]);
					assert.equal(posts.length, 0, "no HTTP request should fire for a stale ref");
				},
			);
		});
	});
});
