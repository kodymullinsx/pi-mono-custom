import { describe, expect, it } from "vitest";
import { streamSimple } from "../src/index.js";
import type { Context, Model } from "../src/types.js";

function makeModel(): Model<"anthropic-messages"> {
	return {
		id: "claude-sonnet-4-5",
		name: "claude-sonnet-4-5",
		api: "anthropic-messages",
		provider: "anthropic",
		baseUrl: "http://127.0.0.1:9",
		reasoning: true,
		input: ["text", "image", "document"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 200000,
		maxTokens: 8192,
	};
}

describe("Anthropic user document serialization", () => {
	it("serializes user PDF blocks as Anthropic documents, not images", async () => {
		let capturedPayload: any;
		const context: Context = {
			systemPrompt: "",
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "inspect this" },
						{
							type: "document",
							mimeType: "application/pdf",
							data: "JVBERi0xLjQ=",
							fileName: "evidence.pdf",
						},
					],
					timestamp: Date.now(),
				},
			],
		};

		const stream = streamSimple(makeModel(), context, {
			apiKey: "fake-key",
			onPayload: (payload) => {
				capturedPayload = payload;
				return payload;
			},
		});

		await stream.result();

		const content = capturedPayload.messages[0].content;
		expect(content[1]).toMatchObject({
			type: "document",
			source: {
				type: "base64",
				media_type: "application/pdf",
				data: "JVBERi0xLjQ=",
			},
			title: "evidence.pdf",
		});
	});
});
