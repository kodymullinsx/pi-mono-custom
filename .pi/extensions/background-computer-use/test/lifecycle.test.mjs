import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { startBackgroundComputerUse, formatStartResult } from "../lifecycle.ts";
import { SUPPORTED_CONTRACT_VERSION } from "../config.ts";

async function withTempDir(fn) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "bcu-lifecycle-"));
	try {
		return await fn(root);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
}

async function createRepo(root) {
	const repoPath = path.join(root, "background-computer-use");
	await fs.mkdir(path.join(repoPath, "script"), { recursive: true });
	await fs.writeFile(path.join(repoPath, "script", "start.sh"), "#!/usr/bin/env bash\n");
	await fs.writeFile(path.join(repoPath, "script", "build_and_run.sh"), "#!/usr/bin/env bash\n");
	return repoPath;
}

async function createApp(root) {
	const appPath = path.join(root, "BackgroundComputerUse.app");
	await fs.mkdir(appPath, { recursive: true });
	return appPath;
}

function config(repoPath, appPath) {
	return {
		manifestPath: "/tmp/background-computer-use/runtime-manifest.json",
		manifestCandidatePaths: ["/tmp/background-computer-use/runtime-manifest.json"],
		timeoutMs: 1000,
		startTimeoutMs: 5000,
		debug: false,
		enableObservation: false,
		enableActions: false,
		autoStart: false,
		repoPath,
		appPath,
		maxImageBytes: 1024 * 1024,
		actionLockPath: path.join(os.tmpdir(), "background-computer-use", "pi-action.lock"),
		actionLockTtlMs: 30_000,
	};
}

function status(running, ready = true) {
	return {
		manifestPath: "/tmp/background-computer-use/runtime-manifest.json",
		manifest: running
			? {
					contractVersion: SUPPORTED_CONTRACT_VERSION,
					baseURL: "http://127.0.0.1:54321",
					routes: [],
				}
			: undefined,
		health: running ? { ok: true } : undefined,
		bootstrap: running
			? {
					contractVersion: SUPPORTED_CONTRACT_VERSION,
					permissions: {
						accessibility: { granted: ready, promptable: true },
						screenRecording: { granted: ready, promptable: true },
					},
					instructions: {
						ready,
						summary: ready ? "ready" : "permissions missing",
						agent: [],
						user: ready ? [] : ["Grant Accessibility.", "Grant Screen Recording."],
					},
					routes: [],
				}
			: undefined,
		errors: [],
		warnings: [],
		missingRoutes: [],
		contractSupported: running,
	};
}

function clientWith(statuses) {
	let index = 0;
	return {
		async getStatus() {
			const value = statuses[Math.min(index, statuses.length - 1)];
			index += 1;
			return value;
		},
	};
}

function runnerWith(resultByCommand = {}) {
	const calls = [];
	const runner = async (command, args, options) => {
		calls.push({ command, args, options });
		const key = command === "pgrep" ? "pgrep" : command === "open" ? "open" : "start";
		return resultByCommand[key] ?? { exitCode: key === "pgrep" ? 1 : 0, stdout: "", stderr: "", timedOut: false };
	};
	runner.calls = calls;
	return runner;
}

test("healthy runtimes are not restarted", async () => {
	await withTempDir(async (root) => {
		const repoPath = await createRepo(root);
		const runner = runnerWith();
		const result = await startBackgroundComputerUse(config(repoPath), {
			allowSideEffects: true,
			client: clientWith([status(true)]),
			runner,
		});

		assert.equal(result.ok, true);
		assert.equal(result.skipped, true);
		assert.equal(runner.calls.length, 0);
	});
});

test("installed app startup opens the app and skips source checkout scripts", async () => {
	await withTempDir(async (root) => {
		const repoPath = await createRepo(root);
		const appPath = await createApp(root);
		const runner = runnerWith({
			open: { exitCode: 0, stdout: "", stderr: "", timedOut: false },
		});
		const result = await startBackgroundComputerUse(config(repoPath, appPath), {
			client: clientWith([status(false), status(false), status(true)]),
			runner,
		});

		assert.equal(result.ok, true);
		assert.equal(result.startMethod, "installed_app");
		assert.equal(runner.calls.some((call) => call.command === "open" && call.args.at(-1) === appPath), true);
		assert.equal(runner.calls.some((call) => call.command === "bash"), false);
	});
});

test("installed app startup forwards only explicitly enabled runtime capabilities", async () => {
	await withTempDir(async (root) => {
		const repoPath = await createRepo(root);
		const appPath = await createApp(root);
		const enabledConfig = { ...config(repoPath, appPath), enableObservation: true, enableActions: true };
		const runner = runnerWith({ open: { exitCode: 0, stdout: "", stderr: "", timedOut: false } });

		const result = await startBackgroundComputerUse(enabledConfig, {
			client: clientWith([status(false), status(false), status(true)]),
			runner,
		});

		assert.equal(result.ok, true);
		const openCall = runner.calls.find((call) => call.command === "open");
		assert.deepEqual(openCall.args, [
			"--env",
			"BCU_ENABLE_OBSERVATION=1",
			"--env",
			"BCU_ENABLE_ACTIONS=1",
			appPath,
		]);
	});
});

test("installed app startup reports timeout when polling never becomes healthy", async () => {
	await withTempDir(async (root) => {
		const repoPath = await createRepo(root);
		const appPath = await createApp(root);
		const fastTimeoutConfig = { ...config(repoPath, appPath), startTimeoutMs: 1 };
		const runner = runnerWith({
			open: { exitCode: 0, stdout: "", stderr: "", timedOut: false },
		});
		const result = await startBackgroundComputerUse(fastTimeoutConfig, {
			client: clientWith([status(false), status(false), status(false)]),
			runner,
		});

		assert.equal(result.ok, false);
		assert.equal(result.startMethod, "installed_app");
		assert.equal(result.reason, "start_timeout");
	});
});

test("missing installed app reports the app path before source checkout side effects", async () => {
	await withTempDir(async (root) => {
		const repoPath = await createRepo(root);
		const missingApp = path.join(root, "missing.app");
		const runner = runnerWith();
		const result = await startBackgroundComputerUse(config(repoPath, missingApp), {
			client: clientWith([status(false)]),
			runner,
		});

		assert.equal(result.ok, false);
		assert.equal(result.reason, "side_effects_not_allowed");
		assert.equal(result.appPath, missingApp);
		assert.match(result.message, /Installed app path was not usable/);
		assert.equal(runner.calls.some((call) => call.command === "bash"), false);
	});
});

test("start is blocked unless side effects are allowed", async () => {
	await withTempDir(async (root) => {
		const repoPath = await createRepo(root);
		const result = await startBackgroundComputerUse(config(repoPath), {
			client: clientWith([status(false)]),
			runner: runnerWith(),
		});

		assert.equal(result.ok, false);
		assert.equal(result.skipped, true);
		assert.equal(result.reason, "side_effects_not_allowed");
		assert.match(formatStartResult(result).content[0].text, /Source checkout side effects/);
	});
});

test("missing checkout paths fail before running a command", async () => {
	const runner = runnerWith();
	const result = await startBackgroundComputerUse(config("/not/a/bcu/repo"), {
		allowSideEffects: true,
		client: clientWith([status(false)]),
		runner,
	});

	assert.equal(result.ok, false);
	assert.equal(result.reason, "invalid_repo_path");
	assert.equal(runner.calls.length, 0);
});

test("unhealthy existing processes are not killed without forceRestart", async () => {
	await withTempDir(async (root) => {
		const repoPath = await createRepo(root);
		const runner = runnerWith({
			pgrep: { exitCode: 0, stdout: "12345\n", stderr: "", timedOut: false },
		});
		const result = await startBackgroundComputerUse(config(repoPath), {
			allowSideEffects: true,
			client: clientWith([status(false)]),
			runner,
		});

		assert.equal(result.ok, false);
		assert.equal(result.reason, "unhealthy_existing_process");
		assert.deepEqual(result.processIds, ["12345"]);
		assert.equal(runner.calls.some((call) => call.command === "bash"), false);
	});
});

test("allowed startup runs start.sh and reports the refreshed runtime", async () => {
	await withTempDir(async (root) => {
		const repoPath = await createRepo(root);
		const runner = runnerWith({
			pgrep: { exitCode: 1, stdout: "", stderr: "", timedOut: false },
			start: { exitCode: 0, stdout: "BackgroundComputerUse running\n", stderr: "", timedOut: false },
		});
		const result = await startBackgroundComputerUse(config(repoPath), {
			allowSideEffects: true,
			client: clientWith([status(false), status(true, false)]),
			runner,
		});

		assert.equal(result.ok, true);
		assert.equal(result.skipped, false);
		assert.equal(runner.calls.some((call) => call.command === "bash" && call.args[0].endsWith("script/start.sh")), true);
		assert.match(formatStartResult(result).content[0].text, /Grant Accessibility/);
	});
});

test("startup timeouts are reported", async () => {
	await withTempDir(async (root) => {
		const repoPath = await createRepo(root);
		const runner = runnerWith({
			pgrep: { exitCode: 1, stdout: "", stderr: "", timedOut: false },
			start: { exitCode: null, stdout: "", stderr: "slow", timedOut: true },
		});
		const result = await startBackgroundComputerUse(config(repoPath), {
			allowSideEffects: true,
			client: clientWith([status(false), status(false)]),
			runner,
		});

		assert.equal(result.ok, false);
		assert.equal(result.reason, "start_timeout");
	});
});
