import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BcuClient, BcuClientError, MAX_RESPONSE_BODY_BYTES } from "../client.ts";
import { errorResult } from "../results.ts";
import { defaultActionLockPath, manifestCandidatePaths, REQUIRED_PHASE1_ROUTES, SUPPORTED_CONTRACT_VERSION } from "../config.ts";
import { resolveTrustedFilePath } from "../safeFiles.ts";

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
		instanceID: "test-instance",
		authorizationToken: "test-authorization-token",
		capabilities: { observe: true, action: true },
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
		{ mode: 0o600 },
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
		enableObservation: false,
		enableActions: false,
		autoStart: false,
		appPath: "/Users/kodymullins/Applications/BackgroundComputerUse.app",
		maxImageBytes: 1024 * 1024,
		actionLockPath: path.join(os.tmpdir(), "background-computer-use", "pi-action.lock"),
		actionLockTtlMs: 30_000,
		stateTokenTtlMs: 15_000,
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

test("explicit manifests outside the temp root remain beneath the filesystem-root trust anchor", async () => {
	const root = await fs.mkdtemp(path.join(process.cwd(), ".bcu-client-root-"));
	try {
		const manifestPath = await writeManifest(root, "http://127.0.0.1:1234");
		assert.equal(await resolveTrustedFilePath(path.parse(manifestPath).root, path.dirname(manifestPath), manifestPath), manifestPath);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
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

test("manifest reads reject symlinks and non-owner-only modes", async () => {
	await withTempDir(async (root) => {
		const target = await writeManifest(root, "http://127.0.0.1:1234");
		const symlink = path.join(root, "manifest-link.json");
		await fs.symlink(target, symlink);
		await assert.rejects(client(symlink).readManifest(), (error) => {
			assert.equal(error.code, "manifest_invalid");
			return true;
		});

		await fs.chmod(target, 0o644);
		await assert.rejects(client(target).readManifest(), (error) => {
			assert.equal(error.code, "manifest_invalid");
			assert.match(error.message, /owner-only/);
			return true;
		});
	});
});

test("manifest reads reject parent-directory symlink traversal", async () => {
	await withTempDir(async (root) => {
		const expectedRoot = path.join(root, "expected");
		const outsideRoot = path.join(root, "outside");
		await fs.mkdir(expectedRoot);
		await fs.mkdir(outsideRoot);
		await writeManifest(outsideRoot, "http://127.0.0.1:1234");
		const linkedParent = path.join(expectedRoot, "linked-parent");
		await fs.symlink(outsideRoot, linkedParent, "dir");

		await assert.rejects(client(path.join(linkedParent, "runtime-manifest.json")).readManifest(), (error) => {
			assert.equal(error.code, "manifest_invalid");
			assert.match(error.message, /parent|resolved|trusted/i);
			return true;
		});
	});
});

test("manifest reads fail closed when startedAt is missing", async () => {
	await withTempDir(async (root) => {
		const manifestPath = await writeManifest(root, "http://127.0.0.1:1234", { startedAt: undefined });
		await assert.rejects(client(manifestPath).readManifest(), (error) => {
			assert.equal(error.code, "manifest_invalid");
			assert.match(error.message, /startedAt/);
			return true;
		});
	});
});

test("manifest reads require authenticated launch identity, credential, capabilities, and exact contract", async () => {
	await withTempDir(async (root) => {
		for (const [field, overrides] of [
			["instanceID", { instanceID: undefined }],
			["authorizationToken", { authorizationToken: undefined }],
			["capabilities", { capabilities: undefined }],
		]) {
			const candidateRoot = path.join(root, field);
			await fs.mkdir(candidateRoot);
			const manifestPath = await writeManifest(candidateRoot, "http://127.0.0.1:1234", overrides);
			await assert.rejects(client(manifestPath).readManifest(), (error) => {
				assert.equal(error.code, "manifest_invalid");
				assert.match(error.message, new RegExp(field, "i"));
				return true;
			});
		}

		const legacyRoot = path.join(root, "legacy");
		await fs.mkdir(legacyRoot);
		const legacyPath = await writeManifest(legacyRoot, "http://127.0.0.1:1234", { contractVersion: "legacy-contract" });
		await assert.rejects(client(legacyPath).readManifest(), (error) => {
			assert.equal(error.code, "unsupported_contract");
			return true;
		});
	});
});

test("every system, observation, and action request carries pinned authentication headers", async () => {
	await withTempDir(async (root) => {
		const seen = [];
		await withServer(async (req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			seen.push({ path: req.url, authorization: req.headers.authorization, instanceID: req.headers["x-bcu-instance-id"] });
			const url = new URL(req.url ?? "/", baseURL);
			if (url.pathname === "/health") return json(res, 200, { ok: true, contractVersion: SUPPORTED_CONTRACT_VERSION });
			if (url.pathname === "/v1/bootstrap") return json(res, 200, bootstrap(baseURL));
			if (url.pathname === "/v1/routes") return json(res, 200, { contractVersion: SUPPORTED_CONTRACT_VERSION, routes: routeSummaries() });
			return json(res, 200, { ok: true });
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			const instance = client(manifestPath);
			await instance.getHealth();
			await instance.getBootstrap();
			await instance.getRoutes();
			await instance.postRoute("/v1/list_apps", {});
			await instance.postRoute("/v1/click", { window: "win", stateToken: "state", x: 1, y: 2 });
		});

		assert.equal(seen.length, 5);
		for (const request of seen) {
			assert.equal(request.authorization, "Bearer test-authorization-token");
			assert.equal(request.instanceID, "test-instance");
		}
	});
});

test("the manifest credential is redacted from successful responses and errors", async () => {
	await withTempDir(async (root) => {
		await withServer((req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			const url = new URL(req.url ?? "/", baseURL);
			if (url.pathname === "/v1/list_apps") {
				return json(res, 200, { note: "echo test-authorization-token here", runningApps: [] });
			}
			return json(res, 403, { message: "rejected test-authorization-token", authorizationToken: "test-authorization-token" });
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			const instance = client(manifestPath);
			const response = await instance.postRoute("/v1/list_apps", {});
			assert.doesNotMatch(JSON.stringify(response), /test-authorization-token/);
			await assert.rejects(instance.postRoute("/v1/click", {}), (error) => {
				assert.doesNotMatch(`${error.message} ${JSON.stringify(error.details)}`, /test-authorization-token/);
				return true;
			});
		});
	});
});

test("a client pins one manifest endpoint for its lifetime", async () => {
	await withTempDir(async (root) => {
		const manifestPath = await writeManifest(root, "http://127.0.0.1:1234");
		const instance = client(manifestPath);
		assert.equal((await instance.readManifest()).baseURL, "http://127.0.0.1:1234");
		await fs.writeFile(
			manifestPath,
			JSON.stringify({ ...bootstrap("http://127.0.0.1:5678"), routes: routeSummaries() }),
			{ mode: 0o600 },
		);
		assert.equal((await instance.readManifest()).baseURL, "http://127.0.0.1:1234");
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

test("malformed responses never expose raw bytes or the exact bearer in thrown or formatted errors", async () => {
	await withTempDir(async (root) => {
		await withServer((_req, res) => text(res, 200, "malformed test-authorization-token response"), async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await assert.rejects(client(manifestPath).getRoutes(), (error) => {
				const formatted = errorResult(error, "Route failed");
				const visible = `${error.message} ${JSON.stringify(error.details)} ${JSON.stringify(formatted)}`;
				assert.doesNotMatch(visible, /test-authorization-token|malformed/);
				assert.equal(error.code, "non_json_response");
				return true;
			});
		});
	});
});

test("HTTP response bodies are capped while streaming before text or JSON materialization", async () => {
	await withTempDir(async (root) => {
		await withServer((_req, res) => {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(Buffer.alloc(MAX_RESPONSE_BODY_BYTES + 1, 0x61));
		}, async (baseURL) => {
			const manifestPath = await writeManifest(root, baseURL);
			await assert.rejects(client(manifestPath).getHealth(), (error) => {
				assert.equal(error.code, "response_too_large");
				assert.doesNotMatch(error.message, /a{20}/);
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

test("ready gate rejects every inconsistent contract and pinned bootstrap identity combination", async () => {
	await withTempDir(async (root) => {
		let scenario = {};
		await withServer((req, res) => {
			const baseURL = `http://127.0.0.1:${req.socket.localPort}`;
			const url = new URL(req.url ?? "/", baseURL);
			if (url.pathname === "/health") return json(res, 200, { ok: true, contractVersion: scenario.healthVersion ?? SUPPORTED_CONTRACT_VERSION });
			if (url.pathname === "/v1/bootstrap") return json(res, 200, bootstrap(baseURL, {
				contractVersion: scenario.bootstrapVersion ?? SUPPORTED_CONTRACT_VERSION,
				baseURL: scenario.bootstrapBaseURL ?? baseURL,
				startedAt: scenario.bootstrapStartedAt ?? "2026-04-25T01:00:00Z",
				instanceID: scenario.bootstrapInstanceID ?? "test-instance",
			}));
			if (url.pathname === "/v1/routes") return json(res, 200, { contractVersion: scenario.routesVersion ?? SUPPORTED_CONTRACT_VERSION, routes: routeSummaries() });
			return json(res, 404, { ok: false });
		}, async (baseURL) => {
			const cases = [
				["health", { healthVersion: "wrong" }, "unsupported_contract"],
				["bootstrap", { bootstrapVersion: "wrong" }, "unsupported_contract"],
				["routes", { routesVersion: "wrong" }, "unsupported_contract"],
				["baseURL", { bootstrapBaseURL: "http://127.0.0.1:1" }, "manifest_invalid"],
				["startedAt", { bootstrapStartedAt: "2026-04-25T01:01:00Z" }, "manifest_invalid"],
				["instanceID", { bootstrapInstanceID: "wrong-instance" }, "manifest_invalid"],
			];
			for (const [name, values, code] of cases) {
				scenario = values;
				const caseRoot = path.join(root, name);
				await fs.mkdir(caseRoot);
				const manifestPath = await writeManifest(caseRoot, baseURL);
				await assert.rejects(client(manifestPath).assertPhase1Ready(), (error) => {
					assert.equal(error.code, code);
					return true;
				});
			}
		});
	});
});
