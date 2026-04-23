import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BUDDY_MODEL, loadBuddyConfig, resolveBuddyModel } from "../config.ts";

test("loadBuddyConfig defaults Buddy to OpenAI Codex GPT-5.4 Mini", () => {
	const config = loadBuddyConfig({});

	assert.equal(DEFAULT_BUDDY_MODEL, "openai-codex/gpt-5.4-mini");
	assert.equal(config.modelId, "openai-codex/gpt-5.4-mini");
});

test("loadBuddyConfig preserves explicit PI_BUDDY_MODEL overrides", () => {
	const config = loadBuddyConfig({ PI_BUDDY_MODEL: "novita/google/gemma-4-31b-it" });

	assert.equal(config.modelId, "novita/google/gemma-4-31b-it");
});

test("resolveBuddyModel keeps explicit openai-codex targets intact", () => {
	assert.deepEqual(resolveBuddyModel("openai-codex/gpt-5.4-mini"), {
		provider: "openai-codex",
		id: "gpt-5.4-mini",
	});
});
