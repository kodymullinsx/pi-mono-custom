import assert from "node:assert/strict";
import test from "node:test";

import {
	canonicalActionDigest,
	clearActionApprovals,
	confirmActionToolCall,
	consumeActionApproval,
} from "../confirmation.ts";

function context(mode, confirm) {
	return { mode, hasUI: mode === "tui", ui: { confirm } };
}

test.afterEach(() => clearActionApprovals());

test("TUI approval is bound to toolCallId and canonical final input, then consumed once", async () => {
	const input = { stateToken: "state", window: "win", text: "hello", elementIndex: 3 };
	const event = { toolCallId: "call-1", toolName: "bcu_type_text", input };
	assert.equal(await confirmActionToolCall(event, context("tui", async () => true)), undefined);
	assert.deepEqual(consumeActionApproval("call-1", "bcu_type_text", { elementIndex: 3, text: "hello", window: "win", stateToken: "state" }), { ok: true });
	assert.deepEqual(consumeActionApproval("call-1", "bcu_type_text", input), { ok: false, reason: "missing" });
});

test("later input mutation, tool mismatch, denial, and every non-TUI mode fail closed", async () => {
	const input = { window: "win", stateToken: "state", key: "return" };
	await confirmActionToolCall(
		{ toolCallId: "mutated", toolName: "bcu_press_key", input },
		context("tui", async () => true),
	);
	input.key = "command+q";
	assert.deepEqual(consumeActionApproval("mutated", "bcu_press_key", input), { ok: false, reason: "mismatch" });

	await confirmActionToolCall(
		{ toolCallId: "wrong-tool", toolName: "bcu_press_key", input: { ...input, key: "return" } },
		context("tui", async () => true),
	);
	assert.deepEqual(consumeActionApproval("wrong-tool", "bcu_click", { ...input, key: "return" }), { ok: false, reason: "mismatch" });

	const denied = await confirmActionToolCall(
		{ toolCallId: "denied", toolName: "bcu_press_key", input },
		context("tui", async () => false),
	);
	assert.equal(denied.block, true);
	assert.deepEqual(consumeActionApproval("denied", "bcu_press_key", input), { ok: false, reason: "missing" });
	const aborted = await confirmActionToolCall(
		{ toolCallId: "aborted", toolName: "bcu_press_key", input },
		context("tui", async () => {
			throw new Error("aborted");
		}),
	);
	assert.equal(aborted.block, true);
	assert.deepEqual(consumeActionApproval("aborted", "bcu_press_key", input), { ok: false, reason: "missing" });

	for (const mode of ["rpc", "print", "json"]) {
		const result = await confirmActionToolCall(
			{ toolCallId: `mode-${mode}`, toolName: "bcu_press_key", input },
			context(mode, async () => true),
		);
		assert.equal(result.block, true);
	}
});

test("parallel action preflights prompt sequentially", async () => {
	const order = [];
	let releaseFirst;
	const first = confirmActionToolCall(
		{ toolCallId: "parallel-1", toolName: "bcu_press_key", input: { window: "win", stateToken: "a", key: "a" } },
		context("tui", async () => {
			order.push("first-start");
			await new Promise((resolve) => {
				releaseFirst = resolve;
			});
			order.push("first-end");
			return true;
		}),
	);
	const second = confirmActionToolCall(
		{ toolCallId: "parallel-2", toolName: "bcu_press_key", input: { window: "win", stateToken: "b", key: "b" } },
		context("tui", async () => {
			order.push("second");
			return true;
		}),
	);
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual(order, ["first-start"]);
	releaseFirst();
	await Promise.all([first, second]);
	assert.deepEqual(order, ["first-start", "first-end", "second"]);
});

test("canonical digest is stable across object key ordering", () => {
	assert.equal(
		canonicalActionDigest("bcu_click", { window: "win", x: 1, y: 2 }),
		canonicalActionDigest("bcu_click", { y: 2, x: 1, window: "win" }),
	);
});
