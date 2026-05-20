import { describe, expect, it } from "vitest";
import { AssistantMessageEventStream } from "../src/utils/event-stream.js";

describe("AssistantMessageEventStream", () => {
	it("rejects result() instead of hanging when ended without a terminal event or result", async () => {
		const stream = new AssistantMessageEventStream();

		stream.end();

		await expect(stream.result()).rejects.toThrow("EventStream ended without a final result");
	});
});
