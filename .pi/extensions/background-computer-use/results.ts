import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { PromptContentBlock } from "@mariozechner/pi-ai";
import {
	BcuClientError,
	type BcuRouteSummary,
	type JsonObject,
	type RouteCatalogResponse,
	type RuntimeStatus,
} from "./client.ts";
import type { BcuExtensionConfig } from "./config.ts";

export interface BcuToolDetails {
	ok: boolean;
	kind: string;
	errorCode?: string;
	route?: string;
	count?: number;
	[key: string]: unknown;
}

export function textResult(text: string, details: BcuToolDetails): AgentToolResult<BcuToolDetails> {
	return {
		content: [{ type: "text", text }],
		details,
	};
}

export function errorResult(error: unknown, context: string): AgentToolResult<BcuToolDetails> {
	if (error instanceof BcuClientError) {
		const lines = [`${context}: ${error.message}`, `Classification: ${error.code}`];
		if (error.status) lines.push(`HTTP status: ${error.status}`);
		if (error.recovery?.length) {
			lines.push("", "Recovery:");
			for (const item of error.recovery) lines.push(`- ${item}`);
		}
		return textResult(lines.join("\n"), {
			ok: false,
			kind: "error",
			errorCode: error.code,
			status: error.status,
			recovery: error.recovery,
			details: error.details,
		});
	}

	return textResult(`${context}: ${error instanceof Error ? error.message : String(error)}`, {
		ok: false,
		kind: "error",
		errorCode: "unknown",
	});
}

function routeLine(route: BcuRouteSummary): string {
	const label = route.category ? `${route.category}: ` : "";
	return `- ${route.method} ${route.path} (${route.id})${route.summary ? ` - ${label}${route.summary}` : ""}`;
}

export function formatStatusResult(
	status: RuntimeStatus,
	debug = false,
	options: { actionsEnabled?: boolean } = {},
): AgentToolResult<BcuToolDetails> {
	const lines = ["BackgroundComputerUse status"];
	lines.push(`Manifest: ${status.manifestPath}`);
	if (status.configuredManifestPath && status.configuredManifestPath !== status.manifestPath) {
		lines.push(`Configured manifest: ${status.configuredManifestPath}`);
	}

	if (!status.manifest) {
		lines.push("Runtime: not discovered");
	} else {
		lines.push(`Runtime: discovered at ${status.manifest.baseURL}`);
		lines.push(`Contract: ${status.manifest.contractVersion}${status.contractSupported ? "" : " (unsupported)"}`);
		if (status.manifest.startedAt) lines.push(`Started: ${status.manifest.startedAt}`);
	}

	if (status.bootstrap) {
		const permissions = status.bootstrap.permissions;
		lines.push(
			`Permissions: Accessibility ${permissions.accessibility.granted ? "granted" : "missing"}, Screen Recording ${
				permissions.screenRecording.granted ? "granted" : "missing"
			}`,
		);
		lines.push(`Ready: ${status.bootstrap.instructions.ready ? "yes" : "no"}`);
		if (status.bootstrap.instructions.summary) lines.push(`Summary: ${status.bootstrap.instructions.summary}`);
	}

	if (status.health) {
		lines.push(`Health: ${status.health.ok === true ? "ok" : "response received"}`);
	}

	const routeCount = status.routes?.routes.length ?? status.manifest?.routes.length ?? 0;
	lines.push(`Routes: ${routeCount}${status.missingRoutes.length ? ` (${status.missingRoutes.length} required missing)` : ""}`);
	if (options.actionsEnabled !== undefined) {
		lines.push(`Pi action tools: ${options.actionsEnabled ? "enabled" : "disabled"}`);
	}

	if (status.warnings.length > 0) {
		lines.push("", "Warnings:");
		for (const warning of status.warnings) lines.push(`- ${warning}`);
	}

	if (status.errors.length > 0) {
		lines.push("", "Errors:");
		for (const error of status.errors) lines.push(`- ${error.code}: ${error.message}`);
	}

	if (status.bootstrap?.instructions.user?.length) {
		lines.push("", "Next action:");
		for (const item of status.bootstrap.instructions.user) lines.push(`- ${item}`);
	} else if (status.errors.length === 0 && status.warnings.length === 0) {
		lines.push("", "Next action: call bcu_list_apps or bcu_list_windows.");
	}

	if (debug) {
		if (status.manifestCandidatePaths?.length) {
			lines.push("", "Manifest candidates:");
			for (const candidate of status.manifestCandidatePaths) lines.push(`- ${candidate}`);
		}
		if (status.missingRoutes.length > 0) {
			lines.push("", "Missing required routes:");
			for (const route of status.missingRoutes) lines.push(`- ${route}`);
		}
		if (status.routes?.routes.length) {
			lines.push("", "Route catalog:");
			for (const route of status.routes.routes) lines.push(routeLine(route));
		}
	}

	return textResult(lines.join("\n"), {
		ok: status.errors.length === 0,
		kind: "status",
		contractSupported: status.contractSupported,
		missingRoutes: status.missingRoutes,
		errorCount: status.errors.length,
		warnings: status.warnings,
		actionsEnabled: options.actionsEnabled,
	});
}

export function formatRoutesResult(routes: RouteCatalogResponse, debug = false): AgentToolResult<BcuToolDetails> {
	const lines = [`BackgroundComputerUse routes (${routes.routes.length})`, `Contract: ${routes.contractVersion}`];
	for (const route of routes.routes) {
		lines.push(routeLine(route));
		if (debug && "notes" in route && Array.isArray(route.notes)) {
			for (const note of route.notes.filter((item): item is string => typeof item === "string")) {
				lines.push(`  note: ${note}`);
			}
		}
	}
	return textResult(lines.join("\n"), {
		ok: true,
		kind: "routes",
		count: routes.routes.length,
		routes: routes.routes,
	});
}

function asObject(value: unknown): JsonObject | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function arrayLength(value: unknown): number | undefined {
	return Array.isArray(value) ? value.length : undefined;
}

export function formatListAppsResult(response: JsonObject, debug = false): AgentToolResult<BcuToolDetails> {
	const apps = Array.isArray(response.runningApps) ? response.runningApps.map(asObject).filter((app) => app !== undefined) : [];
	const frontmost = asObject(response.frontmostApp);
	const lines = [`Running apps: ${apps.length}`];
	if (frontmost) {
		lines.push(`Frontmost: ${asString(frontmost.name) ?? "unknown"} (${asString(frontmost.bundleID) ?? "unknown bundle"})`);
	}
	for (const app of apps.slice(0, 25)) {
		const name = asString(app.name) ?? "unknown";
		const bundleID = asString(app.bundleID) ?? "unknown bundle";
		const pid = asNumber(app.pid);
		const windows = asNumber(app.onscreenWindowCount);
		lines.push(`- ${name} (${bundleID})${pid !== undefined ? ` pid=${pid}` : ""}${windows !== undefined ? ` windows=${windows}` : ""}`);
	}
	if (apps.length > 25) lines.push(`... ${apps.length - 25} more apps omitted from text output.`);
	if (debug && Array.isArray(response.notes) && response.notes.length > 0) {
		lines.push("", "Notes:");
		for (const note of response.notes.filter((item): item is string => typeof item === "string")) lines.push(`- ${note}`);
	}
	return textResult(lines.join("\n"), {
		ok: true,
		kind: "list_apps",
		route: "POST /v1/list_apps",
		count: apps.length,
		response,
	});
}

export function formatListWindowsResult(response: JsonObject, debug = false): AgentToolResult<BcuToolDetails> {
	const windows = Array.isArray(response.windows)
		? response.windows.map(asObject).filter((window) => window !== undefined)
		: [];
	const app = asObject(response.app);
	const appName = asString(app?.name) ?? "unknown app";
	const lines = [`Windows for ${appName}: ${windows.length}`];
	for (const window of windows.slice(0, 25)) {
		const id = asString(window.windowID) ?? "unknown-window";
		const title = asString(window.title) ?? "";
		const flags = [
			window.isFocused === true ? "focused" : undefined,
			window.isMain === true ? "main" : undefined,
			window.isMinimized === true ? "minimized" : undefined,
			window.isOnScreen === false ? "offscreen" : undefined,
		].filter((flag): flag is string => flag !== undefined);
		lines.push(`- ${id}${title ? ` - ${title}` : ""}${flags.length ? ` [${flags.join(", ")}]` : ""}`);
	}
	if (windows.length > 25) lines.push(`... ${windows.length - 25} more windows omitted from text output.`);
	if (debug && Array.isArray(response.notes) && response.notes.length > 0) {
		lines.push("", "Notes:");
		for (const note of response.notes.filter((item): item is string => typeof item === "string")) lines.push(`- ${note}`);
	}
	return textResult(lines.join("\n"), {
		ok: true,
		kind: "list_windows",
		route: "POST /v1/list_windows",
		count: windows.length,
		response,
	});
}

function tempRoot(): string {
	return path.join((process.env.TMPDIR ?? os.tmpdir()).replace(/\/+$/, ""), "background-computer-use");
}

function pathInside(root: string, candidate: string): boolean {
	const resolvedRoot = path.resolve(root);
	const resolvedCandidate = path.resolve(candidate);
	return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

async function imageBlockFromPath(imagePath: string, mimeType: string | undefined, config: BcuExtensionConfig): Promise<PromptContentBlock | undefined> {
	if (!pathInside(tempRoot(), imagePath)) return undefined;
	const stat = await fs.stat(imagePath);
	if (!stat.isFile() || stat.size > config.maxImageBytes) return undefined;
	return {
		type: "image",
		data: await fs.readFile(imagePath, "base64"),
		mimeType: mimeType ?? "image/png",
	};
}

function imageBlockFromBase64(imageBase64: string, mimeType: string | undefined, config: BcuExtensionConfig): PromptContentBlock | undefined {
	const approximateBytes = Math.ceil((imageBase64.length * 3) / 4);
	if (approximateBytes > config.maxImageBytes) return undefined;
	return {
		type: "image",
		data: imageBase64,
		mimeType: mimeType ?? "image/png",
	};
}

export function formatActionResult(actionName: string, route: string, response: JsonObject): AgentToolResult<BcuToolDetails> {
	const window = asObject(response.window);
	const screenshot = asObject(response.screenshot);
	const image = asObject(screenshot?.image);
	const verification = asObject(response.verification);
	const warnings = Array.isArray(response.warnings)
		? response.warnings.filter((item): item is string => typeof item === "string")
		: [];
	const lines = [`BackgroundComputerUse ${actionName}`];
	if (typeof response.ok === "boolean") lines.push(`Result: ${response.ok ? "ok" : "not verified"}`);
	if (asString(response.classification)) lines.push(`Classification: ${asString(response.classification)}`);
	if (asString(response.failureDomain)) lines.push(`Failure domain: ${asString(response.failureDomain)}`);
	if (asString(response.summary)) lines.push(`Summary: ${asString(response.summary)}`);
	const windowID = asString(window?.windowID);
	if (windowID) lines.push(`Window: ${windowID}${asString(window?.title) ? ` - ${asString(window?.title)}` : ""}`);
	if (asString(response.preStateToken)) lines.push(`Pre-state token: ${asString(response.preStateToken)}`);
	if (asString(response.postStateToken)) lines.push(`Post-state token: ${asString(response.postStateToken)}`);
	if (asString(image?.imagePath)) lines.push(`Screenshot path: ${asString(image?.imagePath)}`);
	if (warnings.length > 0) {
		lines.push("", "Warnings:");
		for (const warning of warnings) lines.push(`- ${warning}`);
	}
	if (verification && Object.keys(verification).length > 0) lines.push("Verification: available in details.response.");

	return textResult(lines.join("\n"), {
		ok: response.ok === true,
		kind: "action",
		action: actionName,
		route,
		classification: asString(response.classification),
		failureDomain: asString(response.failureDomain),
		preStateToken: asString(response.preStateToken),
		postStateToken: asString(response.postStateToken),
		windowID,
		warnings,
		response,
	});
}

export async function formatGetWindowStateResult(
	response: JsonObject,
	options: { includeImage?: boolean; debug?: boolean; config: BcuExtensionConfig },
): Promise<AgentToolResult<BcuToolDetails>> {
	const window = asObject(response.window);
	const screenshot = asObject(response.screenshot);
	const image = asObject(screenshot?.image);
	const focused = asObject(response.focusedElement);
	const performance = asObject(response.performance);
	const tree = asObject(response.tree);
	const stateToken = asString(response.stateToken);
	const imagePath = asString(image?.imagePath);
	const imageBase64 = asString(image?.imageBase64);
	const mimeType = asString(image?.mimeType);
	const pixelWidth = asNumber(image?.pixelWidth);
	const pixelHeight = asNumber(image?.pixelHeight);

	const lines = ["Window state captured"];
	lines.push(`Window: ${asString(window?.windowID) ?? "unknown"}${asString(window?.title) ? ` - ${asString(window?.title)}` : ""}`);
	if (stateToken) lines.push(`State token: ${stateToken}`);
	lines.push(`Screenshot: ${asString(screenshot?.status) ?? "unknown"}`);
	if (imagePath) lines.push(`Screenshot path: ${imagePath}`);
	if (imageBase64) lines.push("Screenshot base64: available but omitted from text output.");
	if (pixelWidth !== undefined && pixelHeight !== undefined) lines.push(`Screenshot size: ${pixelWidth}x${pixelHeight}`);
	const nodeCount = arrayLength(tree?.nodes) ?? asNumber(tree?.nodeCount);
	if (nodeCount !== undefined) lines.push(`Projected nodes: ${nodeCount}`);
	if (focused) {
		const focusedParts = [
			asNumber(focused.index) !== undefined ? `index=${asNumber(focused.index)}` : undefined,
			asString(focused.displayRole),
			asString(focused.title),
		].filter((part): part is string => part !== undefined && part.length > 0);
		if (focusedParts.length > 0) lines.push(`Focused element: ${focusedParts.join(" ")}`);
	}
	if (performance && asNumber(performance.totalMs) !== undefined) lines.push(`Read time: ${asNumber(performance.totalMs)}ms`);
	if (options.debug && Array.isArray(response.notes) && response.notes.length > 0) {
		lines.push("", "Notes:");
		for (const note of response.notes.filter((item): item is string => typeof item === "string")) lines.push(`- ${note}`);
	}

	const content: PromptContentBlock[] = [{ type: "text", text: lines.join("\n") }];
	if (options.includeImage) {
		try {
			const block = imageBase64
				? imageBlockFromBase64(imageBase64, mimeType, options.config)
				: imagePath
					? await imageBlockFromPath(imagePath, mimeType, options.config)
					: undefined;
			if (block) content.push(block);
		} catch {
			lines.push("\nImage attachment: unavailable; screenshot path was not readable within limits.");
			content[0] = { type: "text", text: lines.join("\n") };
		}
	}

	return {
		content,
		details: {
			ok: true,
			kind: "get_window_state",
			route: "POST /v1/get_window_state",
			stateToken,
			windowID: asString(window?.windowID),
			screenshotPath: imagePath,
			hasImageAttachment: content.some((block) => block.type === "image"),
			response,
		},
	};
}
