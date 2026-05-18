import type { BootstrapResponse } from "./client.ts";

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
