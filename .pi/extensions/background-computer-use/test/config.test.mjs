import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../config.ts";

test("observation and actions are enabled by default", () => {
	const config = loadConfig({ HOME: "/tmp/bcu-home", TMPDIR: "/tmp" });

	assert.equal(config.enableObservation, true);
	assert.equal(config.enableActions, true);
	assert.equal(config.autoStart, false, "startup remains human-only by default");
});

test("observation and actions support explicit environment opt-out", () => {
	for (const disabled of ["0", "false", "no"]) {
		const config = loadConfig({
			HOME: "/tmp/bcu-home",
			TMPDIR: "/tmp",
			BCU_ENABLE_OBSERVATION: disabled,
			BCU_ENABLE_ACTIONS: disabled,
		});

		assert.equal(config.enableObservation, false, `observation should be disabled by ${disabled}`);
		assert.equal(config.enableActions, false, `actions should be disabled by ${disabled}`);
	}
});
