import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import backgroundComputerUseExtension from "../index.ts";
import { REQUIRED_PHASE1_ROUTES, SUPPORTED_CONTRACT_VERSION } from "../config.ts";

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

function bootstrap(baseURL) {
	return {
		contractVersion: SUPPORTED_CONTRACT_VERSION,
		baseURL,
		permissions: {
			accessibility: { granted: true, promptable: true },
			screenRecording: { granted: true, promptable: true },
		},
		instructions: { ready: true, summary: "ready", agent: [], user: [] },
		routes: routeSummaries(),
	};
}

async function writeManifest(root, baseURL) {
	const manifestPath = path.join(root, "runtime-manifest.json");
	await fs.writeFile(manifestPath, JSON.stringify({ ...bootstrap(baseURL), routes: routeSummaries() }));
	return manifestPath;
}

function registerTools() {
	const tools = new Map();
	backgroundComputerUseExtension({
		registerTool(tool) {
			tools.set(tool.name, tool);
		},
		registerCommand() {},
	});
	return tools;
}

function createHandler(baseURL, posts, overrides = {}) {
	return async (req, res) => {
		const url = new URL(req.url ?? "/", baseURL);
		if (req.method === "GET" && url.pathname === "/health") {
			json(res, 200, { ok: true, contractVersion: SUPPORTED_CONTRACT_VERSION });
			return;
		}
		if (req.method === "GET" && url.pathname === "/v1/bootstrap") {
			json(res, 200, bootstrap(baseURL));
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
			if (url.pathname === "/v1/get_window_state") {
				json(res, 200, {
					contractVersion: SUPPORTED_CONTRACT_VERSION,
					stateToken: "state-1",
					window: { windowID: body.window, title: "Test" },
					screenshot: { status: body.imageMode === "omit" ? "omitted" : "ok" },
					tree: { nodes: [] },
					focusedElement: {},
					backgroundSafety: {},
					performance: { totalMs: 1 },
					notes: [],
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
				postStateToken: "post-state",
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
			await withEnv({ BCU_MANIFEST_PATH: manifestPath, BCU_ENABLE_ACTIONS: undefined }, async () => {
				const tool = registerTools().get("bcu_get_window_state");
				await tool.execute("call-1", { window: "win-1" });
				await tool.execute("call-2", { window: "win-2", profile: "fast_visual" });
				await tool.execute("call-3", { window: "win-3", profile: "semantic" });
				await tool.execute("call-4", { window: "win-4", profile: "fast_visual", imageMode: "omit", maxNodes: 12 });
				await tool.execute("call-5", { window: "win-5", profile: "full_debug" });
			});
		});

		assert.deepEqual(posts.map((post) => post.body), [
			{ window: "win-1", imageMode: "path" },
			{ window: "win-2", imageMode: "path", maxNodes: 50 },
			{ window: "win-3", imageMode: "omit", maxNodes: 500 },
			{ window: "win-4", imageMode: "omit", maxNodes: 12 },
			{
				window: "win-5",
				imageMode: "path",
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
					BCU_ENABLE_ACTIONS: "1",
					BCU_ACTION_LOCK_PATH: path.join(root, "action.lock"),
				},
				async () => {
					const tools = registerTools();
					assert.equal(tools.has("bcu_scroll"), true);
					assert.equal(tools.has("bcu_type_text"), true);
					assert.equal(tools.has("bcu_set_value"), true);
					assert.equal(tools.has("bcu_perform_secondary_action"), true);

					await tools.get("bcu_scroll").execute("call-1", {
						window: "win",
						stateToken: "state",
						elementIndex: 2,
						direction: "down",
						pages: 1,
						verificationMode: "fast",
						imageMode: "path",
					});
					await tools.get("bcu_type_text").execute("call-2", {
						window: "win",
						elementIndex: 3,
						text: "hello",
						focusAssistMode: "focus_and_caret_end",
					});
					await tools.get("bcu_set_value").execute("call-3", { window: "win", elementIndex: 4, value: "value" });
					await tools.get("bcu_perform_secondary_action").execute("call-4", {
						window: "win",
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
					stateToken: "state",
					imageMode: "path",
					elementIndex: 2,
					direction: "down",
					pages: 1,
					verificationMode: "fast",
				},
			},
			{
				path: "/v1/type_text",
				body: { window: "win", elementIndex: 3, text: "hello", focusAssistMode: "focus_and_caret_end" },
			},
			{ path: "/v1/set_value", body: { window: "win", elementIndex: 4, value: "value" } },
			{
				path: "/v1/perform_secondary_action",
				body: {
					window: "win",
					elementIndex: 5,
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
						BCU_ENABLE_ACTIONS: "1",
						BCU_ACTION_LOCK_PATH: lockPath,
					},
					async () => {
						const tools = registerTools();
						const abortController = new AbortController();
						abortController.abort();
						const aborted = await tools.get("bcu_press_key").execute("aborted", { window: "win", key: "return" }, abortController.signal);
						assert.equal(aborted.details.ok, false);
						await assert.rejects(fs.access(lockPath));

						const okFalse = await tools.get("bcu_press_key").execute("call-1", { window: "win", key: "return" });
						assert.equal(okFalse.details.ok, false);
						await assert.rejects(fs.access(lockPath));

						const failure = await tools.get("bcu_type_text").execute("call-2", { window: "win", text: "hello" });
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
						const blocked = await tools.get("bcu_set_value").execute("call-3", { window: "win", elementIndex: 1, value: "x" });
						assert.equal(blocked.details.kind, "action_lock");
						assert.equal(posts.some((post) => post.path === "/v1/set_value"), false);
					},
				);
			},
		);
	});
});
