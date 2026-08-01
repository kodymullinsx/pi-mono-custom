import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BootstrapResponse } from "./client.ts";
import type { BcuTargetIdentity } from "./refs.ts";

const execFileAsync = promisify(execFile);

export type BcuRouteId =
	| "health"
	| "bootstrap"
	| "routes"
	| "list_apps"
	| "list_windows"
	| "get_window_state"
	| "click"
	| "scroll"
	| "perform_secondary_action"
	| "drag"
	| "resize"
	| "set_window_frame"
	| "type_text"
	| "press_key"
	| "set_value";

export interface PermissionDecision {
	allowed: boolean;
	routeId: BcuRouteId;
	summary: string;
	missing: Array<"accessibility" | "screenRecording">;
	remediation: string[];
}

export interface CapabilityDecision {
	allowed: boolean;
	capability: "observe" | "act";
	summary: string;
}

export interface ActionSessionDecision {
	allowed: boolean;
	summary: string;
	reasons: string[];
}

export interface ActionSessionSnapshot {
	consoleUser: string;
	consoleUid: number;
	processUid: number;
	consoleRegistry: string;
	secureInputRegistry: string;
}

export function decideCapability(capability: "observe" | "act", enabled: boolean): CapabilityDecision {
	return enabled
		? { allowed: true, capability, summary: `${capability} capability is enabled for this Pi session.` }
		: {
				allowed: false,
				capability,
				summary: `${capability} capability is disabled for this Pi session. Remove the BCU_ENABLE_${capability === "observe" ? "OBSERVATION" : "ACTIONS"}=0 opt-out (or set it to 1) before starting Pi to grant it.`,
			};
}

// Adapter-only heuristics cannot establish code identity. They intentionally
// favor false positives for well-known password, login, authentication, and
// permission UI. The sidecar must enforce identity-based policy for completeness.
const SENSITIVE_BUNDLE_PARTS = [
	"1password",
	"bitwarden",
	"dashlane",
	"keepass",
	"lastpass",
	"proton.pass",
	"password",
	"keychainaccess",
	"securityagent",
	"loginwindow",
	"authorizationhost",
];

const SENSITIVE_APP_NAMES = [
	"1password",
	"bitwarden",
	"dashlane",
	"keepass",
	"lastpass",
	"passwords",
	"keychain access",
	"securityagent",
	"loginwindow",
];

const SENSITIVE_WINDOW_PATTERN =
	/\b(authentication|authorization|login|password|passcode|verification code|two[- ]factor|privacy & security|accessibility permission|screen recording|allow access|permission request)\b/i;

export function sensitiveTargetReason(target: BcuTargetIdentity): string | undefined {
	const bundleId = target.bundleId?.toLowerCase();
	if (bundleId && SENSITIVE_BUNDLE_PARTS.some((part) => bundleId.includes(part))) {
		return `bundle ID ${target.bundleId} matches a sensitive-application deny rule`;
	}
	const appName = target.appName?.toLowerCase();
	if (appName && SENSITIVE_APP_NAMES.some((name) => appName === name || appName.includes(`${name} `))) {
		return `application ${target.appName} matches a sensitive-application deny rule`;
	}
	if (target.windowTitle && SENSITIVE_WINDOW_PATTERN.test(target.windowTitle)) {
		return `window title matches a login, security, or permission-dialog deny rule`;
	}
	return undefined;
}

export function evaluateActionSession(snapshot: ActionSessionSnapshot): ActionSessionDecision {
	const reasons: string[] = [];
	if (!snapshot.consoleUser || snapshot.consoleUser === "root" || snapshot.consoleUser === "loginwindow") {
		reasons.push("no ordinary user owns the active console");
	}
	if (snapshot.consoleUid !== snapshot.processUid) reasons.push("Pi is not running as the active console user");

	const users = Array.from(snapshot.consoleRegistry.matchAll(/"kCGSSessionUserNameKey"="([^"]+)"/g));
	const onConsole = Array.from(snapshot.consoleRegistry.matchAll(/"kCGSSessionOnConsoleKey"=(Yes|No)/g));
	if (users.length !== 1 || users[0]?.[1] !== snapshot.consoleUser) {
		reasons.push("console session ownership is ambiguous or fast-user switching is active");
	}
	if (onConsole.length !== 1 || onConsole[0]?.[1] !== "Yes") {
		reasons.push("the active graphical session is not uniquely on-console");
	}
	if (/"(?:k)?CGSSessionScreenIsLocked"=Yes/.test(snapshot.consoleRegistry)) reasons.push("the screen is locked");
	if (/"kCGSessionLoginDoneKey"=No/.test(snapshot.consoleRegistry)) reasons.push("the login session is incomplete");
	if (/"kCGSSessionLoginwindowSafeLogin"=Yes/.test(snapshot.consoleRegistry)) reasons.push("loginwindow safe-login UI is active");

	const secureLines = snapshot.secureInputRegistry
		.split("\n")
		.filter((line) => /secure(?:input|event)/i.test(line));
	if (secureLines.some((line) => !/=\s*(?:No|false|0)\b/i.test(line))) reasons.push("macOS secure input is active");

	return {
		allowed: reasons.length === 0,
		summary:
			reasons.length === 0
				? "The active console session passed adapter safety preconditions."
				: `Action blocked by console-session safety checks: ${reasons.join("; ")}.`,
		reasons,
	};
}

export async function checkActionSession(): Promise<ActionSessionDecision> {
	if (process.platform !== "darwin" || process.getuid === undefined) {
		return {
			allowed: false,
			summary: "Action blocked because macOS console-session safety could not be established.",
			reasons: ["unsupported platform or missing process UID"],
		};
	}
	try {
		const [consoleResult, consoleRegistryResult, secureInputResult] = await Promise.all([
			execFileAsync("/usr/bin/stat", ["-f", "%u:%Su", "/dev/console"], { encoding: "utf8", timeout: 2_000 }),
			execFileAsync("/usr/sbin/ioreg", ["-n", "Root", "-d1"], { encoding: "utf8", timeout: 2_000, maxBuffer: 2 * 1024 * 1024 }),
			execFileAsync("/usr/sbin/ioreg", ["-l", "-w", "0"], { encoding: "utf8", timeout: 3_000, maxBuffer: 16 * 1024 * 1024 }),
		]);
		const match = String(consoleResult.stdout).trim().match(/^(\d+):(.+)$/);
		if (!match) throw new Error("unexpected /dev/console ownership response");
		return evaluateActionSession({
			consoleUid: Number(match[1]),
			consoleUser: match[2],
			processUid: process.getuid(),
			consoleRegistry: String(consoleRegistryResult.stdout),
			secureInputRegistry: String(secureInputResult.stdout),
		});
	} catch (error) {
		return {
			allowed: false,
			summary: `Action blocked because macOS console-session safety could not be established: ${error instanceof Error ? error.message : String(error)}`,
			reasons: ["console-session probe failed"],
		};
	}
}

function hasAccessibility(bootstrap: BootstrapResponse): boolean {
	return bootstrap.permissions.accessibility.granted === true;
}

function hasScreenRecording(bootstrap: BootstrapResponse): boolean {
	return bootstrap.permissions.screenRecording.granted === true;
}

function fullReady(bootstrap: BootstrapResponse): boolean {
	return bootstrap.instructions.ready === true || (hasAccessibility(bootstrap) && hasScreenRecording(bootstrap));
}

function userInstructions(bootstrap: BootstrapResponse): string[] {
	return bootstrap.instructions.user?.filter((line) => line.trim().length > 0) ?? [];
}

export function decidePermission(
	routeId: BcuRouteId,
	bootstrap: BootstrapResponse,
	options: { imageMode?: "path" | "base64" | "omit" } = {},
): PermissionDecision {
	const missing: Array<"accessibility" | "screenRecording"> = [];

	switch (routeId) {
		case "health":
		case "bootstrap":
		case "routes":
		case "list_apps":
			break;
		case "list_windows":
			if (!hasAccessibility(bootstrap)) missing.push("accessibility");
			break;
		case "get_window_state":
			if (!hasAccessibility(bootstrap)) missing.push("accessibility");
			if ((options.imageMode ?? "path") !== "omit" && !hasScreenRecording(bootstrap)) {
				missing.push("screenRecording");
			}
			break;
		default:
			if (!fullReady(bootstrap)) {
				if (!hasAccessibility(bootstrap)) missing.push("accessibility");
				if (!hasScreenRecording(bootstrap)) missing.push("screenRecording");
			}
			break;
	}

	if (missing.length === 0) {
		return {
			allowed: true,
			routeId,
			summary: `${routeId} is allowed by the current BackgroundComputerUse permission state.`,
			missing,
			remediation: [],
		};
	}

	return {
		allowed: false,
		routeId,
		summary: `${routeId} is blocked because ${missing.join(" and ")} permission is missing.`,
		missing,
		remediation: userInstructions(bootstrap),
	};
}

export function formatPermissionDecision(decision: PermissionDecision): string {
	if (decision.allowed) return decision.summary;
	const lines = [decision.summary];
	if (decision.remediation.length > 0) {
		lines.push("", "Remediation:");
		for (const item of decision.remediation) {
			lines.push(`- ${item}`);
		}
	}
	return lines.join("\n");
}
