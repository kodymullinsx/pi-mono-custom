import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { RuntimeStatus } from "./client.ts";
import { BcuClient } from "./client.ts";
import { type BcuExtensionConfig, loadConfig } from "./config.ts";
import { textResult } from "./results.ts";

const APP_PROCESS_NAME = "BackgroundComputerUse";
const OUTPUT_LIMIT = 12_000;
const POLL_INTERVAL_MS = 500;

export const INSTALLED_APP_SIDE_EFFECTS = ["open the installed BackgroundComputerUse.app", "wait for the runtime manifest"];

export const SOURCE_CHECKOUT_SIDE_EFFECTS = [
	"build the Swift package",
	"create or use a local signing identity/keychain",
	"sign and install ~/Applications/BackgroundComputerUse.app",
	"terminate an existing BackgroundComputerUse process before relaunching",
	"open the installed app and wait for the runtime manifest",
];

export const START_SIDE_EFFECTS = SOURCE_CHECKOUT_SIDE_EFFECTS;

export interface CommandResult {
	exitCode: number | null;
	signal?: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

export interface CommandOptions {
	cwd?: string;
	timeoutMs: number;
	signal?: AbortSignal;
}

export type CommandRunner = (command: string, args: string[], options: CommandOptions) => Promise<CommandResult>;

export type StartMethod = "installed_app" | "source_checkout" | "skipped";

export interface StartBackgroundComputerUseOptions {
	allowSideEffects?: boolean;
	forceRestart?: boolean;
	appPath?: string;
	repoPath?: string;
	debug?: boolean;
	signal?: AbortSignal;
	runner?: CommandRunner;
	client?: BcuClient;
}

export interface StartBackgroundComputerUseResult {
	ok: boolean;
	skipped: boolean;
	startMethod: StartMethod;
	reason?: string;
	appPath?: string;
	repoPath?: string;
	scriptPath?: string;
	sideEffects: string[];
	status?: RuntimeStatus;
	processIds?: string[];
	command?: CommandResult;
	message: string;
}

function trimOutput(value: string): string {
	if (value.length <= OUTPUT_LIMIT) return value;
	return `${value.slice(0, 2_000)}\n... output truncated ...\n${value.slice(-10_000)}`;
}

export const runCommand: CommandRunner = (command, args, options) => {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: options.cwd,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
		}, options.timeoutMs);
		const onAbort = () => child.kill("SIGTERM");

		options.signal?.addEventListener("abort", onAbort, { once: true });
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout = trimOutput(stdout + chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderr = trimOutput(stderr + chunk);
		});
		child.on("error", (error) => {
			clearTimeout(timeout);
			options.signal?.removeEventListener("abort", onAbort);
			reject(error);
		});
		child.on("close", (exitCode, signal) => {
			clearTimeout(timeout);
			options.signal?.removeEventListener("abort", onAbort);
			resolve({ exitCode, signal, stdout, stderr, timedOut });
		});
	});
};

function runningStatus(status: RuntimeStatus): boolean {
	return status.manifest !== undefined && status.health !== undefined && status.errors.length === 0;
}

function permissionLine(status: RuntimeStatus): string | undefined {
	const permissions = status.bootstrap?.permissions;
	if (!permissions) return undefined;
	return `Accessibility ${permissions.accessibility.granted ? "granted" : "missing"}, Screen Recording ${
		permissions.screenRecording.granted ? "granted" : "missing"
	}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			signal?.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", onAbort);
			reject(new Error("BackgroundComputerUse startup wait aborted."));
		};
		signal?.addEventListener("abort", onAbort, { once: true });
	});
}

async function waitForHealthyStatus(client: BcuClient, timeoutMs: number, signal?: AbortSignal): Promise<RuntimeStatus> {
	const deadline = Date.now() + timeoutMs;
	let last = await client.getStatus(signal);
	while (!runningStatus(last)) {
		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) return last;
		await sleep(Math.min(POLL_INTERVAL_MS, remainingMs), signal);
		last = await client.getStatus(signal);
	}
	return last;
}

async function findRunningProcessIds(runner: CommandRunner, timeoutMs: number, signal?: AbortSignal): Promise<string[]> {
	const result = await runner("pgrep", ["-x", APP_PROCESS_NAME], { timeoutMs, signal }).catch(() => undefined);
	if (!result || result.exitCode !== 0) return [];
	return result.stdout
		.split(/\s+/)
		.map((item) => item.trim())
		.filter((item) => /^\d+$/.test(item));
}

async function validateAppPath(appPath: string): Promise<string> {
	const resolvedAppPath = path.resolve(appPath);
	await fs.access(resolvedAppPath);
	return resolvedAppPath;
}

async function validateRepoPath(repoPath: string): Promise<string> {
	const resolvedRepoPath = path.resolve(repoPath);
	const scriptPath = path.join(resolvedRepoPath, "script", "start.sh");
	const buildScriptPath = path.join(resolvedRepoPath, "script", "build_and_run.sh");
	await fs.access(scriptPath);
	await fs.access(buildScriptPath);
	return resolvedRepoPath;
}

function sideEffectsAllowed(config: BcuExtensionConfig, options: StartBackgroundComputerUseOptions): boolean {
	return options.allowSideEffects === true || config.autoStart === true;
}

async function startInstalledApp(
	config: BcuExtensionConfig,
	options: StartBackgroundComputerUseOptions,
	runner: CommandRunner,
	client: BcuClient,
	before: RuntimeStatus,
): Promise<StartBackgroundComputerUseResult | undefined> {
	const appPath = options.appPath ?? config.appPath;
	if (!appPath) return undefined;

	let resolvedAppPath: string;
	try {
		resolvedAppPath = await validateAppPath(appPath);
	} catch (error) {
		return {
			ok: false,
			skipped: true,
			startMethod: "installed_app",
			appPath,
			sideEffects: INSTALLED_APP_SIDE_EFFECTS,
			status: before,
			reason: "invalid_app_path",
			message: error instanceof Error ? error.message : String(error),
		};
	}

	const command = await runner("open", [resolvedAppPath], {
		timeoutMs: Math.min(config.startTimeoutMs, 10_000),
		signal: options.signal,
	});
	const status = await waitForHealthyStatus(client, config.startTimeoutMs, options.signal);
	const ok = command.exitCode === 0 && runningStatus(status);
	const baseURL = status.manifest?.baseURL;

	return {
		ok,
		skipped: false,
		startMethod: "installed_app",
		appPath: resolvedAppPath,
		sideEffects: INSTALLED_APP_SIDE_EFFECTS,
		status,
		command,
		reason: ok ? undefined : command.timedOut || command.exitCode === 0 ? "start_timeout" : "start_failed",
		message: ok
			? `BackgroundComputerUse opened${baseURL ? ` at ${baseURL}` : ""}.`
			: "Opening the installed BackgroundComputerUse app did not produce a healthy runtime status.",
	};
}

async function startFromSourceCheckout(
	config: BcuExtensionConfig,
	options: StartBackgroundComputerUseOptions,
	runner: CommandRunner,
	client: BcuClient,
	before: RuntimeStatus,
): Promise<StartBackgroundComputerUseResult> {
	const repoPath = options.repoPath ?? config.repoPath;
	if (!repoPath) {
		return {
			ok: false,
			skipped: true,
			startMethod: "source_checkout",
			sideEffects: SOURCE_CHECKOUT_SIDE_EFFECTS,
			status: before,
			reason: "missing_repo_path",
			message: "BCU_REPO_PATH is not set and no repoPath was provided.",
		};
	}

	let resolvedRepoPath: string;
	try {
		resolvedRepoPath = await validateRepoPath(repoPath);
	} catch (error) {
		return {
			ok: false,
			skipped: true,
			startMethod: "source_checkout",
			repoPath,
			sideEffects: SOURCE_CHECKOUT_SIDE_EFFECTS,
			status: before,
			reason: "invalid_repo_path",
			message: error instanceof Error ? error.message : String(error),
		};
	}

	if (!sideEffectsAllowed(config, options)) {
		return {
			ok: false,
			skipped: true,
			startMethod: "source_checkout",
			repoPath: resolvedRepoPath,
			scriptPath: path.join(resolvedRepoPath, "script", "start.sh"),
			sideEffects: SOURCE_CHECKOUT_SIDE_EFFECTS,
			status: before,
			reason: "side_effects_not_allowed",
			message: "Refusing to run script/start.sh until allowSideEffects is true or BCU_AUTO_START=1 is set.",
		};
	}

	const processIds = await findRunningProcessIds(runner, Math.min(config.timeoutMs, 2_500), options.signal);
	if (processIds.length > 0 && !runningStatus(before) && options.forceRestart !== true) {
		return {
			ok: false,
			skipped: true,
			startMethod: "source_checkout",
			repoPath: resolvedRepoPath,
			scriptPath: path.join(resolvedRepoPath, "script", "start.sh"),
			sideEffects: SOURCE_CHECKOUT_SIDE_EFFECTS,
			status: before,
			processIds,
			reason: "unhealthy_existing_process",
			message:
				"Refusing to run script/start.sh because a BackgroundComputerUse process exists but the manifest/status probe is not healthy. Use forceRestart only when restarting that process is intended.",
		};
	}

	const scriptPath = path.join(resolvedRepoPath, "script", "start.sh");
	const command = await runner("bash", [scriptPath], {
		cwd: resolvedRepoPath,
		timeoutMs: config.startTimeoutMs,
		signal: options.signal,
	});
	const status = await client.getStatus(options.signal);
	const ok = command.exitCode === 0 && runningStatus(status);
	const baseURL = status.manifest?.baseURL;

	return {
		ok,
		skipped: false,
		startMethod: "source_checkout",
		repoPath: resolvedRepoPath,
		scriptPath,
		sideEffects: SOURCE_CHECKOUT_SIDE_EFFECTS,
		status,
		processIds,
		command,
		reason: ok ? undefined : command.timedOut ? "start_timeout" : "start_failed",
		message: ok
			? `BackgroundComputerUse started${baseURL ? ` at ${baseURL}` : ""}.`
			: "BackgroundComputerUse start did not produce a healthy runtime status.",
	};
}

export async function startBackgroundComputerUse(
	config: BcuExtensionConfig = loadConfig(),
	options: StartBackgroundComputerUseOptions = {},
): Promise<StartBackgroundComputerUseResult> {
	const runner = options.runner ?? runCommand;
	const client = options.client ?? new BcuClient(config);
	const before = await client.getStatus(options.signal);

	if (runningStatus(before) && options.forceRestart !== true) {
		return {
			ok: true,
			skipped: true,
			startMethod: "skipped",
			appPath: options.appPath ?? config.appPath,
			repoPath: config.repoPath,
			sideEffects: INSTALLED_APP_SIDE_EFFECTS,
			status: before,
			message: `BackgroundComputerUse is already running at ${before.manifest?.baseURL}.`,
		};
	}

	const installedAppResult = await startInstalledApp(config, options, runner, client, before);
	if (installedAppResult && (installedAppResult.ok || installedAppResult.reason !== "invalid_app_path")) return installedAppResult;

	const sourceResult = await startFromSourceCheckout(config, options, runner, client, before);
	if (installedAppResult && sourceResult.reason === "side_effects_not_allowed") {
		return {
			...sourceResult,
			appPath: installedAppResult.appPath,
			message: `Installed app path was not usable (${installedAppResult.message}). ${sourceResult.message}`,
		};
	}
	return sourceResult;
}

export function formatStartResult(result: StartBackgroundComputerUseResult, debug = false) {
	const lines = ["BackgroundComputerUse start"];
	lines.push(`Result: ${result.ok ? "ok" : "blocked or failed"}${result.skipped ? " (no startup command run)" : ""}`);
	lines.push(`Method: ${result.startMethod}`);
	lines.push(`Message: ${result.message}`);
	if (result.reason) lines.push(`Reason: ${result.reason}`);
	if (result.appPath) lines.push(`App: ${result.appPath}`);
	if (result.repoPath) lines.push(`Repository: ${result.repoPath}`);
	if (result.scriptPath) lines.push(`Script: ${result.scriptPath}`);
	if (result.status?.manifest?.baseURL) lines.push(`Runtime: ${result.status.manifest.baseURL}`);
	const permissions = result.status ? permissionLine(result.status) : undefined;
	if (permissions) lines.push(`Permissions: ${permissions}`);
	if (result.status?.bootstrap?.instructions.ready !== undefined) {
		lines.push(`Ready: ${result.status.bootstrap.instructions.ready ? "yes" : "no"}`);
	}
	if (result.status?.bootstrap?.instructions.user?.length) {
		lines.push("", "Next action:");
		for (const item of result.status.bootstrap.instructions.user) lines.push(`- ${item}`);
	}
	lines.push("", result.startMethod === "source_checkout" ? "Source checkout side effects:" : "Installed app startup effects:");
	for (const sideEffect of result.sideEffects) lines.push(`- ${sideEffect}`);
	if (result.processIds?.length) lines.push(`Existing process IDs: ${result.processIds.join(", ")}`);
	if (result.command) {
		lines.push(`Exit code: ${result.command.exitCode ?? "none"}${result.command.timedOut ? " (timed out)" : ""}`);
	}
	if (debug && result.command) {
		if (result.command.stdout.trim()) lines.push("", "stdout:", result.command.stdout.trim());
		if (result.command.stderr.trim()) lines.push("", "stderr:", result.command.stderr.trim());
	}

	return textResult(lines.join("\n"), {
		ok: result.ok,
		kind: "start",
		skipped: result.skipped,
		startMethod: result.startMethod,
		reason: result.reason,
		appPath: result.appPath,
		repoPath: result.repoPath,
		scriptPath: result.scriptPath,
		exitCode: result.command?.exitCode,
		timedOut: result.command?.timedOut,
		processIds: result.processIds,
		contractSupported: result.status?.contractSupported,
		errorCount: result.status?.errors.length,
	});
}
