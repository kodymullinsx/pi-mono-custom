import os from "node:os";
import path from "node:path";

export const BCU_ENV = {
	manifestPath: "BCU_MANIFEST_PATH",
	timeoutMs: "BCU_TIMEOUT_MS",
	debug: "BCU_DEBUG",
	enableObservation: "BCU_ENABLE_OBSERVATION",
	enableActions: "BCU_ENABLE_ACTIONS",
	autoStart: "BCU_AUTO_START",
	repoPath: "BCU_REPO_PATH",
	appPath: "BCU_APP_PATH",
	startTimeoutMs: "BCU_START_TIMEOUT_MS",
	actionLockPath: "BCU_ACTION_LOCK_PATH",
	actionLockTtlMs: "BCU_ACTION_LOCK_TTL_MS",
	stateTokenTtlMs: "BCU_STATE_TOKEN_TTL_MS",
} as const;

export const SUPPORTED_CONTRACT_VERSION = "2026-07-18-authenticated-runtime-v1";
export const DEFAULT_TIMEOUT_MS = 5_000;
export const DEFAULT_START_TIMEOUT_MS = 60_000;
export const DEFAULT_MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const DEFAULT_ACTION_LOCK_TTL_MS = 30_000;
export const DEFAULT_STATE_TOKEN_TTL_MS = 60_000;

export const REQUIRED_PHASE1_ROUTES = [
	{ id: "health", method: "GET", path: "/health" },
	{ id: "bootstrap", method: "GET", path: "/v1/bootstrap" },
	{ id: "routes", method: "GET", path: "/v1/routes" },
	{ id: "list_apps", method: "POST", path: "/v1/list_apps" },
	{ id: "list_windows", method: "POST", path: "/v1/list_windows" },
	{ id: "get_window_state", method: "POST", path: "/v1/get_window_state" },
] as const;

export interface BcuExtensionConfig {
	manifestPath: string;
	manifestCandidatePaths: string[];
	timeoutMs: number;
	startTimeoutMs: number;
	debug: boolean;
	enableObservation: boolean;
	enableActions: boolean;
	autoStart: boolean;
	repoPath?: string;
	appPath?: string;
	maxImageBytes: number;
	actionLockPath: string;
	actionLockTtlMs: number;
	stateTokenTtlMs: number;
}

function tmpRoot(env: NodeJS.ProcessEnv = process.env): string {
	return (env.TMPDIR ?? os.tmpdir()).replace(/\/+$/, "");
}

function uniquePaths(paths: string[]): string[] {
	return Array.from(new Set(paths.filter((item) => item.trim().length > 0)));
}

function candidateTmpRoots(env: NodeJS.ProcessEnv = process.env): string[] {
	const root = tmpRoot(env);
	const roots = [root];
	if (path.basename(root) === "com.apple.shortcuts.mac-helper") roots.push(path.dirname(root));
	return uniquePaths(roots);
}

export function defaultManifestPath(env: NodeJS.ProcessEnv = process.env): string {
	return path.join(tmpRoot(env), "background-computer-use", "runtime-manifest.json");
}

export function helperManifestPath(env: NodeJS.ProcessEnv = process.env): string {
	const roots = candidateTmpRoots(env);
	const baseRoot = roots.length > 1 ? roots[1] : roots[0];
	return path.join(baseRoot, "com.apple.shortcuts.mac-helper", "background-computer-use", "runtime-manifest.json");
}

export function manifestCandidatePaths(env: NodeJS.ProcessEnv = process.env): string[] {
	return uniquePaths([
		env[BCU_ENV.manifestPath] || defaultManifestPath(env),
		...candidateTmpRoots(env).map((root) => path.join(root, "background-computer-use", "runtime-manifest.json")),
		helperManifestPath(env),
	]);
}

export function defaultRepoPath(env: NodeJS.ProcessEnv = process.env): string {
	const home = env.HOME ?? os.homedir();
	return path.join(home, "Downloads", "background-computer-use");
}

export function defaultAppPath(env: NodeJS.ProcessEnv = process.env): string {
	const home = env.HOME ?? os.homedir();
	return path.join(home, "Applications", "BackgroundComputerUse.app");
}

export function defaultActionLockPath(env: NodeJS.ProcessEnv = process.env): string {
	return path.join(tmpRoot(env), "background-computer-use", "pi-action.lock");
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
	if (!value) return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
	return parsed;
}

function flagValue(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined) return fallback;
	const normalized = value.toLowerCase();
	if (value === "1" || normalized === "true" || normalized === "yes") return true;
	if (value === "0" || normalized === "false" || normalized === "no") return false;
	return fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BcuExtensionConfig {
	return {
		manifestPath: env[BCU_ENV.manifestPath] || defaultManifestPath(env),
		manifestCandidatePaths: manifestCandidatePaths(env),
		timeoutMs: parsePositiveInteger(env[BCU_ENV.timeoutMs], DEFAULT_TIMEOUT_MS),
		startTimeoutMs: parsePositiveInteger(env[BCU_ENV.startTimeoutMs], DEFAULT_START_TIMEOUT_MS),
		debug: flagValue(env[BCU_ENV.debug], false),
		enableObservation: flagValue(env[BCU_ENV.enableObservation], true),
		enableActions: flagValue(env[BCU_ENV.enableActions], true),
		autoStart: flagValue(env[BCU_ENV.autoStart], false),
		repoPath: env[BCU_ENV.repoPath] || defaultRepoPath(env),
		appPath: env[BCU_ENV.appPath] || defaultAppPath(env),
		maxImageBytes: DEFAULT_MAX_IMAGE_BYTES,
		actionLockPath: env[BCU_ENV.actionLockPath] || defaultActionLockPath(env),
		actionLockTtlMs: parsePositiveInteger(env[BCU_ENV.actionLockTtlMs], DEFAULT_ACTION_LOCK_TTL_MS),
		stateTokenTtlMs: parsePositiveInteger(env[BCU_ENV.stateTokenTtlMs], DEFAULT_STATE_TOKEN_TTL_MS),
	};
}
