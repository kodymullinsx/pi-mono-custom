import assert from "node:assert/strict";
import test from "node:test";

import { decidePermission, formatPermissionDecision } from "../permissions.ts";
import { SUPPORTED_CONTRACT_VERSION } from "../config.ts";

function bootstrap(accessibility, screenRecording) {
	return {
		contractVersion: SUPPORTED_CONTRACT_VERSION,
		permissions: {
			accessibility: { granted: accessibility, promptable: true },
			screenRecording: { granted: screenRecording, promptable: true },
		},
		instructions: {
			ready: accessibility && screenRecording,
			summary: "test",
			agent: [],
			user: ["Grant missing permissions.", "Relaunch BackgroundComputerUse."],
		},
		routes: [],
	};
}

test("system routes and list_apps are allowed without permissions", () => {
	const state = bootstrap(false, false);
	assert.equal(decidePermission("health", state).allowed, true);
	assert.equal(decidePermission("bootstrap", state).allowed, true);
	assert.equal(decidePermission("routes", state).allowed, true);
	assert.equal(decidePermission("list_apps", state).allowed, true);
});

test("list_windows requires Accessibility", () => {
	const decision = decidePermission("list_windows", bootstrap(false, true));
	assert.equal(decision.allowed, false);
	assert.deepEqual(decision.missing, ["accessibility"]);
	assert.match(formatPermissionDecision(decision), /Grant missing permissions/);
});

test("get_window_state requires Screen Recording unless screenshot is omitted", () => {
	const withoutScreen = bootstrap(true, false);
	assert.deepEqual(decidePermission("get_window_state", withoutScreen, { imageMode: "path" }).missing, [
		"screenRecording",
	]);
	assert.equal(decidePermission("get_window_state", withoutScreen, { imageMode: "omit" }).allowed, true);
});

test("action routes require full ready state", () => {
	const state = bootstrap(true, false);
	for (const route of ["click", "press_key", "scroll", "type_text", "set_value", "perform_secondary_action"]) {
		const decision = decidePermission(route, state);
		assert.equal(decision.allowed, false);
		assert.deepEqual(decision.missing, ["screenRecording"]);
		assert.equal(decidePermission(route, bootstrap(true, true)).allowed, true);
	}
});
