import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { BcuActionLockError, acquireActionLock } from "./actionLock.ts";
import { BcuClient, type JsonObject } from "./client.ts";
import { loadConfig, type BcuExtensionConfig } from "./config.ts";
import { formatStartResult, startBackgroundComputerUse } from "./lifecycle.ts";
import { decidePermission, formatPermissionDecision, type BcuRouteId } from "./permissions.ts";
import {
	errorResult,
	formatActionResult,
	formatGetWindowStateResult,
	formatListAppsResult,
	formatListWindowsResult,
	formatRoutesResult,
	formatStatusResult,
	textResult,
} from "./results.ts";
import {
	BcuClickParamsSchema,
	BcuGetRoutesParamsSchema,
	BcuGetWindowStateParamsSchema,
	BcuListAppsParamsSchema,
	BcuListWindowsParamsSchema,
	BcuPerformSecondaryActionParamsSchema,
	BcuPressKeyParamsSchema,
	BcuScrollParamsSchema,
	BcuSetValueParamsSchema,
	BcuStartParamsSchema,
	BcuStatusParamsSchema,
	BcuTypeTextParamsSchema,
	type BcuClickParams,
	type BcuGetRoutesParams,
	type BcuGetWindowStateParams,
	type BcuListAppsParams,
	type BcuListWindowsParams,
	type BcuPerformSecondaryActionParams,
	type BcuPressKeyParams,
	type BcuScrollParams,
	type BcuSetValueParams,
	type BcuStartParams,
	type BcuStatusParams,
	type BcuTypeTextParams,
} from "./schemas.ts";

function createClient(): BcuClient {
	return new BcuClient(loadConfig());
}

function firstText(result: { content: Array<{ type: string; text?: string }> }): string {
	return result.content.find((block) => block.type === "text")?.text ?? "";
}

function permissionResult(routeId: BcuRouteId, decision: ReturnType<typeof decidePermission>) {
	return textResult(formatPermissionDecision(decision), {
		ok: false,
		kind: "permission",
		route: routeId,
		missing: decision.missing,
		remediation: decision.remediation,
	});
}

type ImageMode = "path" | "base64" | "omit";
type StateProfile = NonNullable<BcuGetWindowStateParams["profile"]>;
type StateProfileDefaults = Partial<BcuGetWindowStateParams>;
type ActionParams =
	| BcuPressKeyParams
	| BcuClickParams
	| BcuScrollParams
	| BcuTypeTextParams
	| BcuSetValueParams
	| BcuPerformSecondaryActionParams;

type ActionResult = AgentToolResult<{ ok: boolean; kind: string; [key: string]: unknown }>;

const STATE_PROFILE_DEFAULTS: Record<StateProfile, StateProfileDefaults> = {
	fast_visual: { imageMode: "path", maxNodes: 50 },
	semantic: { imageMode: "omit", maxNodes: 500 },
	full_debug: {
		imageMode: "path",
		debugMode: "full",
		debug: true,
		includeDiagnostics: true,
		includePlatformProfile: true,
		includeRawCapture: true,
		includeSemanticTree: true,
		includeProjectedTree: true,
	},
};

function stateProfileDefaults(params: BcuGetWindowStateParams): StateProfileDefaults {
	return params.profile ? STATE_PROFILE_DEFAULTS[params.profile] : {};
}

function resolvedImageMode(params: BcuGetWindowStateParams): ImageMode {
	return params.imageMode ?? stateProfileDefaults(params).imageMode ?? "path";
}

function compactBody(params: BcuGetWindowStateParams): JsonObject {
	const defaults = stateProfileDefaults(params);
	const body: JsonObject = {
		window: params.window,
		imageMode: resolvedImageMode(params),
	};
	const optionalFields = [
		"maxNodes",
		"includeMenuBar",
		"menuPath",
		"webTraversal",
		"debugMode",
		"debug",
		"includeDiagnostics",
		"includePlatformProfile",
		"includeRawCapture",
		"includeSemanticTree",
		"includeProjectedTree",
	] as const;
	for (const field of optionalFields) {
		const value = params[field] ?? defaults[field];
		if (value !== undefined) body[field] = value;
	}
	return body;
}

function actionBody(params: ActionParams): JsonObject {
	const body: JsonObject = {
		window: params.window,
	};
	const optionalFields = ["stateToken", "cursor", "includeMenuBar", "maxNodes", "imageMode", "debug"] as const;
	for (const field of optionalFields) {
		const value = params[field];
		if (value !== undefined) body[field] = value;
	}
	return body;
}

function pressKeyBody(params: BcuPressKeyParams): JsonObject {
	return {
		...actionBody(params),
		key: params.key,
	};
}

function scrollBody(params: BcuScrollParams): JsonObject {
	const body: JsonObject = {
		...actionBody(params),
		elementIndex: params.elementIndex,
		direction: params.direction,
	};
	const optionalFields = ["pages", "verificationMode"] as const;
	for (const field of optionalFields) {
		const value = params[field];
		if (value !== undefined) body[field] = value;
	}
	return body;
}

function typeTextBody(params: BcuTypeTextParams): JsonObject {
	const body: JsonObject = {
		...actionBody(params),
		text: params.text,
	};
	const optionalFields = ["elementIndex", "focusAssistMode"] as const;
	for (const field of optionalFields) {
		const value = params[field];
		if (value !== undefined) body[field] = value;
	}
	return body;
}

function setValueBody(params: BcuSetValueParams): JsonObject {
	return {
		...actionBody(params),
		elementIndex: params.elementIndex,
		value: params.value,
	};
}

function performSecondaryActionBody(params: BcuPerformSecondaryActionParams): JsonObject {
	const body: JsonObject = {
		...actionBody(params),
		elementIndex: params.elementIndex,
		action: params.action,
	};
	const optionalFields = ["actionID", "menuPath", "webTraversal"] as const;
	for (const field of optionalFields) {
		const value = params[field];
		if (value !== undefined) body[field] = value;
	}
	return body;
}

function clickBody(params: BcuClickParams): JsonObject | string {
	const hasElement = params.elementIndex !== undefined;
	const hasX = params.x !== undefined;
	const hasY = params.y !== undefined;
	if (hasElement && (hasX || hasY)) return "Provide either elementIndex or x/y coordinates, not both.";
	if (!hasElement && (!hasX || !hasY)) return "Provide elementIndex, or provide both x and y coordinates.";

	const body = actionBody(params);
	const optionalFields = ["elementIndex", "x", "y", "mode", "clickCount", "mouseButton"] as const;
	for (const field of optionalFields) {
		const value = params[field];
		if (value !== undefined) body[field] = value;
	}
	return body;
}

function appendLockReleaseWarning(result: ActionResult, error: unknown): void {
	const message = error instanceof Error ? error.message : String(error);
	const textBlock = result.content.find((block) => block.type === "text");
	if (textBlock && "text" in textBlock && typeof textBlock.text === "string") {
		textBlock.text += `\n\nWarning: action completed, but the local action lock could not be released: ${message}`;
	}
	result.details.lockReleaseError = message;
}

async function postAction(
	config: BcuExtensionConfig,
	client: BcuClient,
	actionName: string,
	routePath: string,
	body: JsonObject,
	signal?: AbortSignal,
): Promise<ActionResult> {
	const lock = await acquireActionLock(config);
	let result: ActionResult | undefined;
	let actionError: unknown;
	try {
		if (signal?.aborted) throw new Error("BackgroundComputerUse action aborted before dispatch.");
		const response = await client.postRoute(routePath, body, signal, { allowOkFalse: true });
		result = formatActionResult(actionName, `POST ${routePath}`, response);
		return result;
	} catch (error) {
		actionError = error;
		throw error;
	} finally {
		try {
			await lock.release();
		} catch (error) {
			if (result) appendLockReleaseWarning(result, error);
			else if (actionError === undefined) throw error;
		}
	}
}

function actionLockResult(error: BcuActionLockError, route: string): ActionResult {
	return textResult(error.message, {
		ok: false,
		kind: "action_lock",
		route,
		lockPath: error.lockPath,
		holder: error.holder,
	});
}

export default function backgroundComputerUseExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "bcu_status",
		label: "BCU Status",
		description:
			"Check the local BackgroundComputerUse sidecar manifest, health, permissions, contract version, and Phase 1 route availability.",
		promptSnippet: "Use bcu_status before using BackgroundComputerUse tools to confirm the sidecar and permissions.",
		promptGuidelines: [
			"Use bcu_status first when the BackgroundComputerUse runtime may not be running or permissions may be missing.",
			"If the runtime or manifest is missing, use bcu_start before giving up on BackgroundComputerUse.",
			"Do not assume a fixed BackgroundComputerUse port; use the manifest-discovered base URL reported by this tool.",
		],
		parameters: BcuStatusParamsSchema,
		async execute(_toolCallId, params: BcuStatusParams, signal) {
			try {
				const config = loadConfig();
				const status = await new BcuClient(config).getStatus(signal);
				return formatStatusResult(status, params.debug === true, { actionsEnabled: config.enableActions });
			} catch (error) {
				return errorResult(error, "Failed to check BackgroundComputerUse status");
			}
		},
	});

	pi.registerTool({
		name: "bcu_get_routes",
		label: "BCU Routes",
		description:
			"Fetch the self-documenting BackgroundComputerUse route catalog. This is diagnostic and remains useful when the contract is unsupported.",
		promptSnippet: "Use bcu_get_routes to inspect the live BackgroundComputerUse API catalog before planning route calls.",
		parameters: BcuGetRoutesParamsSchema,
		async execute(_toolCallId, params: BcuGetRoutesParams, signal) {
			try {
				const routes = await createClient().getRoutes(signal);
				return formatRoutesResult(routes, params.debug === true);
			} catch (error) {
				return errorResult(error, "Failed to fetch BackgroundComputerUse routes");
			}
		},
	});

	pi.registerTool({
		name: "bcu_start",
		label: "BCU Start",
		description:
			"Start the local BackgroundComputerUse sidecar when it is not already healthy. Opens the installed app first, with source-checkout startup available as an explicit fallback.",
		promptSnippet:
			"Use bcu_start when bcu_status reports that BackgroundComputerUse is missing. It opens the installed app before considering heavier source-checkout startup.",
		promptGuidelines: [
			"Call bcu_status first. If a healthy runtime already exists, do not restart it.",
			"Prefer the installed app path. Set allowSideEffects true only when the user has authorized source-checkout script side effects or BCU_AUTO_START=1 is configured.",
			"After bcu_start, call bcu_status and stop for the user if macOS permissions are missing.",
		],
		parameters: BcuStartParamsSchema,
		async execute(_toolCallId, params: BcuStartParams, signal) {
			try {
				const config = loadConfig();
				const result = await startBackgroundComputerUse(config, {
					allowSideEffects: params.allowSideEffects,
					forceRestart: params.forceRestart,
					appPath: params.appPath,
					repoPath: params.repoPath,
					debug: params.debug,
					signal,
				});
				return formatStartResult(result, params.debug === true);
			} catch (error) {
				return errorResult(error, "Failed to start BackgroundComputerUse");
			}
		},
	});

	pi.registerTool({
		name: "bcu_list_apps",
		label: "BCU List Apps",
		description: "List targetable running macOS apps through the local BackgroundComputerUse sidecar.",
		promptSnippet: "Use bcu_list_apps to find running app names and bundle IDs before listing windows.",
		parameters: BcuListAppsParamsSchema,
		async execute(_toolCallId, params: BcuListAppsParams, signal) {
			try {
				const client = createClient();
				const { bootstrap } = await client.assertPhase1Ready(signal);
				const decision = decidePermission("list_apps", bootstrap);
				if (!decision.allowed) return permissionResult("list_apps", decision);
				const response = await client.postRoute("/v1/list_apps", {}, signal);
				return formatListAppsResult(response, params.debug === true);
			} catch (error) {
				return errorResult(error, "Failed to list BackgroundComputerUse apps");
			}
		},
	});

	pi.registerTool({
		name: "bcu_list_windows",
		label: "BCU List Windows",
		description: "List targetable windows for a running macOS app through the local BackgroundComputerUse sidecar.",
		promptSnippet: "Use bcu_list_windows with an app name or bundle ID to get stable window IDs for state reads.",
		parameters: BcuListWindowsParamsSchema,
		async execute(_toolCallId, params: BcuListWindowsParams, signal) {
			try {
				const client = createClient();
				const { bootstrap } = await client.assertPhase1Ready(signal);
				const decision = decidePermission("list_windows", bootstrap);
				if (!decision.allowed) return permissionResult("list_windows", decision);
				const response = await client.postRoute("/v1/list_windows", { app: params.app }, signal);
				return formatListWindowsResult(response, params.debug === true);
			} catch (error) {
				return errorResult(error, "Failed to list BackgroundComputerUse windows");
			}
		},
	});

	pi.registerTool({
		name: "bcu_get_window_state",
		label: "BCU Get Window State",
		description:
			"Read a target window's BackgroundComputerUse state, including screenshot path or optional image block, state token, focused element, and compact tree summary.",
		promptSnippet:
			"Use bcu_get_window_state after bcu_list_windows and before planning any GUI action. Treat the screenshot as visual ground truth.",
		promptGuidelines: [
			"Call bcu_get_window_state before any GUI action and keep the returned state token with the target.",
			"Use profile fast_visual for quick screenshot inspection, semantic for tree-only reads, and full_debug only for diagnostics.",
			"Prefer imageMode path unless an inline image is needed. Do not request debug output unless diagnosing the adapter or runtime.",
		],
		parameters: BcuGetWindowStateParamsSchema,
		async execute(_toolCallId, params: BcuGetWindowStateParams, signal) {
			try {
				const config = loadConfig();
				const client = new BcuClient(config);
				const { bootstrap } = await client.assertPhase1Ready(signal);
				const imageMode = resolvedImageMode(params);
				const decision = decidePermission("get_window_state", bootstrap, { imageMode });
				if (!decision.allowed) return permissionResult("get_window_state", decision);
				const response = await client.postRoute("/v1/get_window_state", compactBody(params), signal);
				return formatGetWindowStateResult(response, {
					includeImage: params.includeImage === true,
					debug: params.debug === true,
					config,
				});
			} catch (error) {
				return errorResult(error, "Failed to get BackgroundComputerUse window state");
			}
		},
	});

	if (loadConfig().enableActions) {
		pi.registerTool({
			name: "bcu_press_key",
			label: "BCU Press Key",
			description: "Press a key or key chord against a target BackgroundComputerUse window.",
			promptSnippet:
				"Use bcu_press_key only after bcu_get_window_state. Pass the latest stateToken when available and read state again afterward.",
			promptGuidelines: [
				"Call bcu_get_window_state before pressing keys and reuse its stateToken when possible.",
				"Treat ok=false action responses as meaningful runtime evidence, not transport failures.",
				"Read state again after meaningful UI changes before planning the next action.",
			],
			parameters: BcuPressKeyParamsSchema,
			async execute(_toolCallId, params: BcuPressKeyParams, signal) {
				const route = "/v1/press_key";
				try {
					const config = loadConfig();
					const client = new BcuClient(config);
					const { bootstrap } = await client.assertPhase1Ready(signal);
					const decision = decidePermission("press_key", bootstrap);
					if (!decision.allowed) return permissionResult("press_key", decision);
					return await postAction(config, client, "press_key", route, pressKeyBody(params), signal);
				} catch (error) {
					if (error instanceof BcuActionLockError) return actionLockResult(error, `POST ${route}`);
					return errorResult(error, "Failed to press BackgroundComputerUse key");
				}
			},
		});

		pi.registerTool({
			name: "bcu_click",
			label: "BCU Click",
			description: "Click a BackgroundComputerUse target by element index or screenshot coordinate.",
			promptSnippet:
				"Use bcu_click only after bcu_get_window_state. Prefer elementIndex when available, otherwise use screenshot coordinates.",
			promptGuidelines: [
				"Call bcu_get_window_state before clicking and reuse its stateToken when possible.",
				"Use either elementIndex or x/y coordinates, not both.",
				"Read state again after meaningful UI changes before planning the next action.",
			],
			parameters: BcuClickParamsSchema,
			async execute(_toolCallId, params: BcuClickParams, signal) {
				const route = "/v1/click";
				try {
					const body = clickBody(params);
					if (typeof body === "string") {
						return textResult(body, { ok: false, kind: "validation", route: `POST ${route}` });
					}
					const config = loadConfig();
					const client = new BcuClient(config);
					const { bootstrap } = await client.assertPhase1Ready(signal);
					const decision = decidePermission("click", bootstrap);
					if (!decision.allowed) return permissionResult("click", decision);
					return await postAction(config, client, "click", route, body, signal);
				} catch (error) {
					if (error instanceof BcuActionLockError) return actionLockResult(error, `POST ${route}`);
					return errorResult(error, "Failed to click BackgroundComputerUse target");
				}
			},
		});

		pi.registerTool({
			name: "bcu_scroll",
			label: "BCU Scroll",
			description: "Scroll a BackgroundComputerUse target element in a direction.",
			promptSnippet:
				"Use bcu_scroll only after bcu_get_window_state. Target an elementIndex in or near the scrollable region.",
			promptGuidelines: [
				"Call bcu_get_window_state before scrolling and reuse its stateToken when possible.",
				"Read state again after scrolling before targeting newly visible content.",
			],
			parameters: BcuScrollParamsSchema,
			async execute(_toolCallId, params: BcuScrollParams, signal) {
				const route = "/v1/scroll";
				try {
					const config = loadConfig();
					const client = new BcuClient(config);
					const { bootstrap } = await client.assertPhase1Ready(signal);
					const decision = decidePermission("scroll", bootstrap);
					if (!decision.allowed) return permissionResult("scroll", decision);
					return await postAction(config, client, "scroll", route, scrollBody(params), signal);
				} catch (error) {
					if (error instanceof BcuActionLockError) return actionLockResult(error, `POST ${route}`);
					return errorResult(error, "Failed to scroll BackgroundComputerUse target");
				}
			},
		});

		pi.registerTool({
			name: "bcu_type_text",
			label: "BCU Type Text",
			description: "Type text into a focused or targeted BackgroundComputerUse text-entry element.",
			promptSnippet:
				"Use bcu_type_text after bcu_get_window_state. Use press_key separately for explicit Return, Tab, or submission.",
			promptGuidelines: [
				"Call bcu_get_window_state before typing and reuse its stateToken when possible.",
				"Use focusAssistMode only when the target should be focused or the caret should move first.",
				"Read state again after typing before planning the next action.",
			],
			parameters: BcuTypeTextParamsSchema,
			async execute(_toolCallId, params: BcuTypeTextParams, signal) {
				const route = "/v1/type_text";
				try {
					const config = loadConfig();
					const client = new BcuClient(config);
					const { bootstrap } = await client.assertPhase1Ready(signal);
					const decision = decidePermission("type_text", bootstrap);
					if (!decision.allowed) return permissionResult("type_text", decision);
					return await postAction(config, client, "type_text", route, typeTextBody(params), signal);
				} catch (error) {
					if (error instanceof BcuActionLockError) return actionLockResult(error, `POST ${route}`);
					return errorResult(error, "Failed to type BackgroundComputerUse text");
				}
			},
		});

		pi.registerTool({
			name: "bcu_set_value",
			label: "BCU Set Value",
			description: "Set a value directly on a semantic BackgroundComputerUse target element.",
			promptSnippet:
				"Use bcu_set_value after bcu_get_window_state when a node supports direct value replacement.",
			promptGuidelines: [
				"Call bcu_get_window_state before setting a value and reuse its stateToken when possible.",
				"Use bcu_type_text instead when keystroke semantics, autocomplete, or submission behavior matters.",
				"Read state again after setting a value before planning the next action.",
			],
			parameters: BcuSetValueParamsSchema,
			async execute(_toolCallId, params: BcuSetValueParams, signal) {
				const route = "/v1/set_value";
				try {
					const config = loadConfig();
					const client = new BcuClient(config);
					const { bootstrap } = await client.assertPhase1Ready(signal);
					const decision = decidePermission("set_value", bootstrap);
					if (!decision.allowed) return permissionResult("set_value", decision);
					return await postAction(config, client, "set_value", route, setValueBody(params), signal);
				} catch (error) {
					if (error instanceof BcuActionLockError) return actionLockResult(error, `POST ${route}`);
					return errorResult(error, "Failed to set BackgroundComputerUse value");
				}
			},
		});

		pi.registerTool({
			name: "bcu_perform_secondary_action",
			label: "BCU Secondary Action",
			description: "Perform an exposed secondary action label on a BackgroundComputerUse target element.",
			promptSnippet:
				"Use bcu_perform_secondary_action only when get_window_state shows an exact secondaryActions label or binding for the target node.",
			promptGuidelines: [
				"Call bcu_get_window_state before secondary actions and reuse its stateToken when possible.",
				"Pass the exact public action label from the target node, and actionID when a binding provides one.",
				"Read state again after meaningful UI changes before planning the next action.",
			],
			parameters: BcuPerformSecondaryActionParamsSchema,
			async execute(_toolCallId, params: BcuPerformSecondaryActionParams, signal) {
				const route = "/v1/perform_secondary_action";
				try {
					const config = loadConfig();
					const client = new BcuClient(config);
					const { bootstrap } = await client.assertPhase1Ready(signal);
					const decision = decidePermission("perform_secondary_action", bootstrap);
					if (!decision.allowed) return permissionResult("perform_secondary_action", decision);
					return await postAction(config, client, "perform_secondary_action", route, performSecondaryActionBody(params), signal);
				} catch (error) {
					if (error instanceof BcuActionLockError) return actionLockResult(error, `POST ${route}`);
					return errorResult(error, "Failed to perform BackgroundComputerUse secondary action");
				}
			},
		});
	}

	pi.registerCommand("bcu-status", {
		description: "Show BackgroundComputerUse runtime, permission, contract, and route status.",
		handler: async (_args, ctx) => {
			const config = loadConfig();
			const status = await new BcuClient(config).getStatus();
			const result = formatStatusResult(status, true, { actionsEnabled: config.enableActions });
			ctx.ui.notify(firstText(result), status.errors.length > 0 ? "warning" : "info");
		},
	});

	pi.registerCommand("bcu-start", {
		description: "Start BackgroundComputerUse by opening the installed app, with source-checkout fallback when allowed.",
		handler: async (_args, ctx) => {
			const result = await startBackgroundComputerUse(loadConfig(), { allowSideEffects: true });
			ctx.ui.notify(firstText(formatStartResult(result, true)), result.ok ? "info" : "warning");
		},
	});

	pi.registerCommand("bcu-help", {
		description: "Show BackgroundComputerUse adapter setup and safety notes.",
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				[
					"BackgroundComputerUse adapter",
					"",
					"Default startup opens the installed app: ~/Applications/BackgroundComputerUse.app, or BCU_APP_PATH.",
					"Use /bcu-start or bcu_start when /bcu-status reports a missing runtime or manifest.",
					"Manifest discovery tries BCU_MANIFEST_PATH, $TMPDIR/background-computer-use/runtime-manifest.json, and the Shortcuts helper temp manifest.",
					"Source checkout startup is a fallback only: BCU_REPO_PATH or ~/Downloads/background-computer-use, with allowSideEffects or BCU_AUTO_START=1.",
					"Permissions attach to the signed .app bundle. Grant Accessibility and Screen Recording to that bundle, then relaunch it.",
					"Read tools are always registered: status, routes, apps, windows, and window state.",
					"Window-state profiles: fast_visual for quick screenshot reads, semantic for imageMode=omit tree reads, full_debug for heavier diagnostics. Explicit fields override profiles.",
					"Action tools require BCU_ENABLE_ACTIONS=1 and expose press_key, click, scroll, type_text, set_value, and perform_secondary_action.",
					"Before actions, read window state, pass the latest stateToken when available, perform one action, and read state again after UI changes.",
					"Mutating action tools use a local file lock; override BCU_ACTION_LOCK_PATH or BCU_ACTION_LOCK_TTL_MS only when needed.",
				].join("\n"),
				"info",
			);
		},
	});
}
