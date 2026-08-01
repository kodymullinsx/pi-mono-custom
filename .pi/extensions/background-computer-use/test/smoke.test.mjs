import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { registerBackgroundComputerUseExtension } from "../index.ts";
import { REQUIRED_PHASE1_ROUTES, SUPPORTED_CONTRACT_VERSION } from "../config.ts";

async function withTempDir(fn) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "bcu-smoke-"));
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
	};
}

async function writeManifest(root, baseURL) {
	const manifestPath = path.join(root, "runtime-manifest.json");
	await fs.writeFile(
		manifestPath,
		JSON.stringify({ ...bootstrap(baseURL), routes: routeSummaries() }),
		{ mode: 0o600 },
	);
	return manifestPath;
}

function createSmokeHandler(baseURL, posts) {
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
			if (url.pathname === "/v1/list_windows") {
				json(res, 200, {
					contractVersion: SUPPORTED_CONTRACT_VERSION,
					app: { name: "TextEdit" },
					windows: [{ windowID: "win-1", title: "Scratch", isFocused: true, isMain: true, isOnScreen: true }],
				});
				return;
			}
			if (url.pathname === "/v1/get_window_state") {
				json(res, 200, {
					contractVersion: SUPPORTED_CONTRACT_VERSION,
					stateToken: `state-capture-${posts.length}`,
					window: { windowID: body.window, title: "Scratch" },
					screenshot: { status: body.imageMode === "omit" ? "omitted" : "ok" },
					tree: { nodes: [{ index: 0 }, { index: 4 }, { index: 9 }] },
					focusedElement: { index: 0, displayRole: "text" },
					backgroundSafety: {},
					performance: { totalMs: 2 },
					notes: [],
				});
				return;
			}
			if (url.pathname === "/v1/press_key" || url.pathname === "/v1/type_text" || url.pathname === "/v1/drag" || url.pathname === "/v1/resize" || url.pathname === "/v1/set_window_frame") {
				json(res, 200, {
					contractVersion: SUPPORTED_CONTRACT_VERSION,
					ok: true,
					classification: "success",
					summary: "Action accepted.",
					window: { windowID: body.window },
					preStateToken: body.stateToken ?? null,
					postStateToken: `post-state-${posts.length}`,
					cursor: { position: { x: body.toX ?? body.x ?? 0, y: body.toY ?? body.y ?? 0 } },
					window: { frame: { x: body.toX ?? body.x ?? 0, y: body.toY ?? body.y ?? 0, width: body.width ?? 800, height: body.height ?? 600 } },
					backgroundSafety: { safe: true, reason: "on-screen" },
					warnings: [],
					verification: {},
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

function registerTools() {
	const tools = new Map();
	registerBackgroundComputerUseExtension({
		on() {},
		registerTool(tool) {
			tools.set(tool.name, tool);
		},
		registerCommand() {},
	}, {
		checkActionSession: async () => ({ allowed: true, summary: "test console session", reasons: [] }),
		consumeActionApproval: () => ({ ok: true }),
	});
	return tools;
}

test("smoke: authenticated capture then one individually approved action", async () => {
	await withTempDir(async (root) => {
		const posts = [];
		await withServer((req, res) => createSmokeHandler(`http://127.0.0.1:${req.socket.localPort}`, posts)(req, res), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await withEnv({
				BCU_MANIFEST_PATH: manifestPath,
				BCU_ENABLE_OBSERVATION: "1",
				BCU_ENABLE_ACTIONS: "1",
				BCU_ACTION_LOCK_PATH: path.join(root, "action.lock"),
			}, async () => {
				const tools = registerTools();
				assert.equal(tools.has("bcu_computer_actions"), false);
				const capture = await tools.get("bcu_capture").execute("capture-1", { app: "TextEdit" });
				assert.equal(capture.details.ok, true);
				const action = await tools.get("bcu_press_key").execute("action-1", {
					windowRef: "@w1",
					stateToken: capture.details.stateToken,
					key: "escape",
				});
				assert.equal(action.details.ok, true);
			});
		});
		assert.deepEqual(posts.map((post) => post.path), ["/v1/list_windows", "/v1/get_window_state", "/v1/press_key"]);
	});
});
