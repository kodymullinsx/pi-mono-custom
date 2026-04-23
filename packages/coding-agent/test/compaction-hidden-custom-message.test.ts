import { describe, expect, it } from "vitest";
import { findTurnStartIndex } from "../src/core/compaction/compaction.js";
import type { SessionEntry } from "../src/core/session-manager.js";

function userEntry(text: string): SessionEntry {
	return {
		type: "message",
		message: {
			role: "user",
			content: [{ type: "text", text }],
			timestamp: Date.now(),
		},
		id: `user-${text}`,
		parentId: null,
		timestamp: new Date().toISOString(),
	};
}

function assistantEntry(text: string): SessionEntry {
	return {
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "text", text }],
			api: "faux",
			provider: "faux",
			model: "faux",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		},
		id: `assistant-${text}`,
		parentId: null,
		timestamp: new Date().toISOString(),
	};
}

function toolResultEntry(text: string): SessionEntry {
	return {
		type: "message",
		message: {
			role: "toolResult",
			toolCallId: "tool-1",
			toolName: "read",
			content: [{ type: "text", text }],
			isError: false,
			timestamp: Date.now(),
		},
		id: `tool-${text}`,
		parentId: null,
		timestamp: new Date().toISOString(),
	};
}

function customMessageEntry(display: boolean): SessionEntry {
	return {
		type: "custom_message",
		customType: "tool_attachment",
		content: [{ type: "text", text: "Read attachment prepared for model inspection." }],
		display,
		id: `custom-${display ? "shown" : "hidden"}`,
		parentId: null,
		timestamp: new Date().toISOString(),
	};
}

describe("compaction turn-boundary handling for custom messages", () => {
	it("does not treat hidden tool attachment messages as turn starts", () => {
		const entries: SessionEntry[] = [
			userEntry("inspect"),
			assistantEntry("calling read"),
			toolResultEntry("Showing PDF page 1 of 1."),
			customMessageEntry(false),
			assistantEntry("done"),
		];

		expect(findTurnStartIndex(entries, 4, 0)).toBe(0);
	});

	it("still treats visible custom messages as turn starts", () => {
		const entries: SessionEntry[] = [userEntry("inspect"), customMessageEntry(true), assistantEntry("done")];

		expect(findTurnStartIndex(entries, 2, 0)).toBe(1);
	});
});
