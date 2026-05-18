import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BcuClient, BcuClientError } from "../client.ts";
import { defaultActionLockPath, manifestCandidatePaths, REQUIRED_PHASE1_ROUTES, SUPPORTED_CONTRACT_VERSION } from "../config.ts";

async function withTempDir(fn) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "bcu-client-"));
	try {
		return await fn(root);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
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

function json(res, statusCode, body, contentType = "application/json") {
	const data = JSON.stringify(body);
	res.writeHead(statusCode, {
		"content-type": contentType,
		"content-length": Buffer.byteLength(data),
	});
	res.end(data);
}

function text(res, statusCode, body) {
	res.writeHead(statusCode, {
		"content-type": "text/plain",
		"content-length": Buffer.byteLength(body),
	});
	res.end(body);
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
		startedAt: "2026-04-25T01:00:00Z",
		permissions: {
			accessibility: { granted: true, promptable: true },
			screenRecording: { granted: true, promptable: true },
			checkedAt: "2026-04-25T01:00:00Z",
			checkMs: 1,
		},
		instructions: { ready: true, summary: "ready", agent: [], user: [] },
		routes: routeSummaries(),
		...overrides,
	};
}

async function writeManifest(root, baseURL, overrides = {}) {
	const manifestPath = path.join(root, "runtime-manifest.json");
	await fs.writeFile(
		manifestPath,
		JSON.stringify({
			...bootstrap(baseURL),
			...overrides,
		}),
	);
	return manifestPath;
}

function client(manifestPath, timeoutMs = 1000, manifestCandidatePaths = [manifestPath]) {
	return new BcuClient({
		manifestPath,
		manifestCandidatePaths,
		timeoutMs,
		startTimeoutMs: 5000,
		debug: false,
		enableActions: false,
		autoStart: false,
		appPath: "/Users/kodymullins/Applications/BackgroundComputerUse.app",
		maxImageBytes: 1024 * 1024,
		actionLockPath: path.join(os.tmpdir(), "background-computer-use", "pi-action.lock"),
		actionLockTtlMs: 30_000,
	});
}

function createHappyHandler(baseURL, overrides = {}) {
	const routes = overrides.routes ?? routeSummaries();
	const contractVersion = overrides.contractVersion ?? SUPPORTED_CONTRACT_VERSION;
	return (req, res) => {
		const url = new URL(req.url ?? "/", baseURL);
		if (req.method === "GET" && url.pathname === "/health") {
			json(res, 200, { ok: true, contractVersion, timestamp: "now" });
			return;
		}
		if (req.method === "GET" && url.pathname === "/v1/bootstrap") {
			json(res, 200, bootstrap(baseURL, { contractVersion, routes, ...overrides.bootstrap }));
			return;
		}
		if (req.method === "GET" && url.pathname === "/v1/routes") {
			json(res, 200, { contractVersion, guide: {}, routes });
			return;
		}
		if (req.method === "POST" && url.pathname === "/v1/list_apps") {
			json(res, 200, { contractVersion, frontmostApp: null, runningApps: [], notes: [] });
			return;
		}
		json(res, 404, { contractVersion, ok: false, error: "route_not_found", message: "missing", requestID: "test" });
	};
}

test("manifest candidates include parent temp root when TMPDIR is a Shortcuts helper", () => {
	const candidates = manifestCandidatePaths({
		TMPDIR: "/tmp/com.apple.shortcuts.mac-helper//",
		HOME: "/Users/example",
	});
	assert.deepEqual(candidates, [
		"/tmp/com.apple.shortcuts.mac-helper/background-computer-use/runtime-manifest.json",
		"/tmp/background-computer-use/runtime-manifest.json",
	]);
});

test("default action lock path is under the BCU temp root", () => {
	assert.equal(
		defaultActionLockPath({ TMPDIR: "/tmp//", HOME: "/Users/example" }),
		"/tmp/background-computer-use/pi-action.lock",
	);
});

test("manifest candidates preserve an explicit configured path when it duplicates a fallback", () => {
	const candidates = manifestCandidatePaths({
		TMPDIR: "/tmp//",
		HOME: "/Users/example",
		BCU_MANIFEST_PATH: "/tmp/background-computer-use/runtime-manifest.json",
	});
	assert.equal(candidates[0], "/tmp/background-computer-use/runtime-manifest.json");
	assert.equal(candidates.filter((item) => item === "/tmp/background-computer-use/runtime-manifest.json").length, 1);
});

test("missing manifest is classified", async () => {
	await withTempDir(async (root) => {
		await assert.rejects(client(path.join(root, "missing.json")).readManifest(), (error) => {
			assert.ok(error instanceof BcuClientError);
			assert.equal(error.code, "manifest_missing");
			return true;
		});
	});
});

test("invalid manifest JSON is classified", async () => {
	await withTempDir(async (root) => {
		const manifestPath = path.join(root, "runtime-manifest.json");
		await fs.writeFile(manifestPath, "{ nope");
		await assert.rejects(client(manifestPath).readManifest(), (error) => {
			assert.ok(error instanceof BcuClientError);
			assert.equal(error.code, "manifest_invalid");
			return true;
		});
	});
});

test("non-loopback manifest baseURL is rejected", async () => {
	await withTempDir(async (root) => {
		const manifestPath = await writeManifest(root, "http://example.com:1234");
		await assert.rejects(client(manifestPath).readManifest(), (error) => {
			assert.ok(error instanceof BcuClientError);
			assert.equal(error.code, "base_url_not_loopback");
			return true;
		});
	});
});

test("fallback manifests are used when the configured path is missing", async () => {
	await withTempDir(async (root) => {
		await withServer(async (req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			createHappyHandler(baseURL)(req, res);
		}, async (baseURL) => {
			const configuredPath = path.join(root, "configured.json");
			const fallbackPath = await writeManifest(root, baseURL);
			const status = await client(configuredPath, 1000, [configuredPath, fallbackPath]).getStatus();
			assert.equal(status.errors.length, 0);
			assert.equal(status.manifestPath, fallbackPath);
			assert.equal(status.configuredManifestPath, configuredPath);
			assert.match(status.warnings.join("\n"), /Using fallback manifest/);
		});
	});
});

test("invalid configured manifests do not block valid fallback manifests", async () => {
	await withTempDir(async (root) => {
		await withServer(async (req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			createHappyHandler(baseURL)(req, res);
		}, async (baseURL) => {
			const configuredPath = path.join(root, "configured.json");
			await fs.writeFile(configuredPath, "{ nope");
			const fallbackRoot = path.join(root, "fallback");
			await fs.mkdir(fallbackRoot, { recursive: true });
			const fallbackPath = await writeManifest(fallbackRoot, baseURL);
			const status = await client(configuredPath, 1000, [configuredPath, fallbackPath]).getStatus();
			assert.equal(status.errors.length, 0);
			assert.equal(status.manifestPath, fallbackPath);
			assert.match(status.warnings.join("\n"), /Ignored 1 earlier manifest candidate/);
		});
	});
});

test("non-loopback fallback manifests are rejected", async () => {
	await withTempDir(async (root) => {
		const configuredPath = path.join(root, "missing.json");
		const fallbackPath = await writeManifest(root, "http://example.com:1234");
		await assert.rejects(client(configuredPath, 1000, [configuredPath, fallbackPath]).readManifest(), (error) => {
			assert.ok(error instanceof BcuClientError);
			assert.equal(error.code, "base_url_not_loopback");
			return true;
		});
	});
});

test("healthy sidecar status has no errors and no missing routes", async () => {
	await withTempDir(async (root) => {
		await withServer(async (req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			createHappyHandler(baseURL)(req, res);
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			const status = await client(manifestPath).getStatus();
			assert.equal(status.errors.length, 0);
			assert.equal(status.missingRoutes.length, 0);
			assert.equal(status.contractSupported, true);
			assert.equal(status.manifest?.baseURL, baseURL);
		});
	});
});

test("read responses without ok are accepted", async () => {
	await withTempDir(async (root) => {
		await withServer(async (req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			createHappyHandler(baseURL)(req, res);
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			const response = await client(manifestPath).postRoute("/v1/list_apps", {});
			assert.deepEqual(response.runningApps, []);
		});
	});
});

test("dead manifest base URLs are classified as connection refused", async () => {
	await withTempDir(async (root) => {
		const server = http.createServer();
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		assert.equal(typeof address, "object");
		const baseURL = `http://127.0.0.1:${address.port}`;
		await new Promise((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
		});

		const manifestPath = await writeManifest(root, baseURL);
		await assert.rejects(client(manifestPath, 100).getHealth(), (error) => {
			assert.ok(error instanceof BcuClientError);
			assert.equal(error.code, "connection_refused");
			return true;
		});
	});
});

test("slow sidecars are classified as timeouts", async () => {
	await withTempDir(async (root) => {
		await withServer((req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			const url = new URL(req.url ?? "/", baseURL);
			if (url.pathname === "/health") {
				setTimeout(() => {
					if (!res.destroyed) json(res, 200, { ok: true, contractVersion: SUPPORTED_CONTRACT_VERSION });
				}, 80);
				return;
			}
			createHappyHandler(baseURL)(req, res);
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await assert.rejects(client(manifestPath, 10).getHealth(), (error) => {
				assert.ok(error instanceof BcuClientError);
				assert.equal(error.code, "timeout");
				return true;
			});
		});
	});
});

test("non-JSON route responses are classified", async () => {
	await withTempDir(async (root) => {
		await withServer((req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			const url = new URL(req.url ?? "/", baseURL);
			if (url.pathname === "/v1/routes") {
				text(res, 200, "not json");
				return;
			}
			createHappyHandler(baseURL)(req, res);
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await assert.rejects(client(manifestPath).getRoutes(), (error) => {
				assert.ok(error instanceof BcuClientError);
				assert.equal(error.code, "non_json_response");
				return true;
			});
		});
	});
});

test("non-2xx JSON errors preserve HTTP classification", async () => {
	await withTempDir(async (root) => {
		await withServer((req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			const url = new URL(req.url ?? "/", baseURL);
			if (url.pathname === "/v1/list_apps") {
				json(res, 403, {
					contractVersion: SUPPORTED_CONTRACT_VERSION,
					ok: false,
					error: "accessibility_denied",
					message: "Accessibility missing.",
					requestID: "test",
					recovery: ["Grant Accessibility."],
				});
				return;
			}
			createHappyHandler(baseURL)(req, res);
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await assert.rejects(client(manifestPath).postRoute("/v1/list_apps", {}), (error) => {
				assert.ok(error instanceof BcuClientError);
				assert.equal(error.code, "http_error");
				assert.equal(error.status, 403);
				assert.deepEqual(error.recovery, ["Grant Accessibility."]);
				return true;
			});
		});
	});
});

test("HTTP 200 ok=false is classified as an API error", async () => {
	await withTempDir(async (root) => {
		await withServer((req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			const url = new URL(req.url ?? "/", baseURL);
			if (url.pathname === "/v1/list_apps") {
				json(res, 200, { ok: false, message: "understood but failed" });
				return;
			}
			createHappyHandler(baseURL)(req, res);
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await assert.rejects(client(manifestPath).postRoute("/v1/list_apps", {}), (error) => {
				assert.ok(error instanceof BcuClientError);
				assert.equal(error.code, "api_error");
				return true;
			});
		});
	});
});

test("action callers can preserve HTTP 200 ok=false responses", async () => {
	await withTempDir(async (root) => {
		await withServer((req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			const url = new URL(req.url ?? "/", baseURL);
			if (url.pathname === "/v1/press_key") {
				json(res, 200, {
					ok: false,
					classification: "effect_not_verified",
					summary: "Native key delivery was attempted, but no effect was verified.",
					warnings: ["test warning"],
				});
				return;
			}
			createHappyHandler(baseURL)(req, res);
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			const response = await client(manifestPath).postRoute("/v1/press_key", { window: "win", key: "return" }, undefined, {
				allowOkFalse: true,
			});
			assert.equal(response.ok, false);
			assert.equal(response.classification, "effect_not_verified");
		});
	});
});

test("missing required Phase 1 routes fail the ready gate", async () => {
	await withTempDir(async (root) => {
		await withServer((req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			createHappyHandler(baseURL, { routes: routeSummaries().filter((route) => route.id !== "get_window_state") })(
				req,
				res,
			);
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await assert.rejects(client(manifestPath).assertPhase1Ready(), (error) => {
				assert.ok(error instanceof BcuClientError);
				assert.equal(error.code, "missing_routes");
				return true;
			});
		});
	});
});

test("unsupported contracts fail the ready gate", async () => {
	await withTempDir(async (root) => {
		await withServer((req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			createHappyHandler(baseURL, { contractVersion: "future-contract" })(req, res);
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL, { contractVersion: "future-contract" });
			await assert.rejects(client(manifestPath).assertPhase1Ready(), (error) => {
				assert.ok(error instanceof BcuClientError);
				assert.equal(error.code, "unsupported_contract");
				return true;
			});
		});
	});
});
