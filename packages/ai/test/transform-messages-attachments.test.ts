import { describe, expect, it } from "vitest";
import { transformMessages } from "../src/api/transform-messages.ts";
import type { Message, Model, ToolResultMessage, UserMessage } from "../src/types.ts";

function makeTextOnlyModel(): Model<"openai-completions"> {
	return {
		id: "text-only",
		name: "Text-only Model",
		api: "openai-completions",
		provider: "openai",
		baseUrl: "https://api.openai.com/v1",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8000,
		maxTokens: 1000,
	};
}

function makeImageOnlyModel(): Model<"openai-completions"> {
	return {
		id: "image-only",
		name: "Image-only Model",
		api: "openai-completions",
		provider: "openai",
		baseUrl: "https://api.openai.com/v1",
		reasoning: false,
		input: ["text", "image"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8000,
		maxTokens: 1000,
	};
}

describe("transformMessages attachment downgrade", () => {
	it("downgrades mixed image and document blocks to distinct placeholders on text-only models", () => {
		const messages: Message[] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "look at these" },
					{ type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
					{ type: "document", mimeType: "application/pdf", data: "JVBERi0xLjQ=", fileName: "report.pdf" },
				],
				timestamp: 1,
			},
		];

		const [result] = transformMessages(messages, makeTextOnlyModel()) as [UserMessage];
		expect(Array.isArray(result.content)).toBe(true);
		const content = result.content as Array<{ type: string; text?: string }>;
		expect(content).toHaveLength(3);
		expect(content[0]).toEqual({ type: "text", text: "look at these" });
		expect(content[1]).toEqual({ type: "text", text: "(image omitted: model does not support images)" });
		expect(content[2].type).toBe("text");
		expect(content[2].text).toContain("report.pdf");
		expect(content[2].text).toContain("application/pdf");
	});

	it("coalesces adjacent same-kind placeholders to a single text block", () => {
		const messages: Message[] = [
			{
				role: "user",
				content: [
					{ type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
					{ type: "image", mimeType: "image/jpeg", data: "/9j/4AAQ" },
				],
				timestamp: 1,
			},
		];

		const [result] = transformMessages(messages, makeTextOnlyModel()) as [UserMessage];
		const content = result.content as Array<{ type: string; text?: string }>;
		expect(content).toHaveLength(1);
		expect(content[0]).toEqual({ type: "text", text: "(image omitted: model does not support images)" });
	});

	it("does not coalesce distinct document placeholders", () => {
		const messages: Message[] = [
			{
				role: "user",
				content: [
					{ type: "document", mimeType: "application/pdf", data: "JVBERi0xLjQ=", fileName: "first.pdf" },
					{ type: "document", mimeType: "application/pdf", data: "JVBERi0xLjQ=", fileName: "second.pdf" },
				],
				timestamp: 1,
			},
		];

		const [result] = transformMessages(messages, makeTextOnlyModel()) as [UserMessage];
		const content = result.content as Array<{ type: string; text?: string }>;
		expect(content).toHaveLength(2);
		expect(content[0].text).toContain("first.pdf");
		expect(content[1].text).toContain("second.pdf");
	});

	it("preserves image blocks but downgrades document blocks when model supports images only", () => {
		const messages: Message[] = [
			{
				role: "user",
				content: [
					{ type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
					{ type: "document", mimeType: "application/pdf", data: "JVBERi0xLjQ=", fileName: "report.pdf" },
				],
				timestamp: 1,
			},
		];

		const [result] = transformMessages(messages, makeImageOnlyModel()) as [UserMessage];
		const content = result.content as Array<{ type: string; text?: string; mimeType?: string }>;
		expect(content).toHaveLength(2);
		expect(content[0].type).toBe("image");
		expect(content[1].type).toBe("text");
		expect(content[1].text).toContain("report.pdf");
	});

	it("downgrades attachments inside tool result messages using the tool-image placeholder", () => {
		const messages: Message[] = [
			{
				role: "user",
				content: "fetch something",
				timestamp: 1,
			},
			{
				role: "toolResult",
				toolCallId: "call_1",
				toolName: "fetch",
				content: [
					{ type: "text", text: "here's the result" },
					{ type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" },
					{ type: "document", mimeType: "application/pdf", data: "JVBERi0xLjQ=", fileName: "result.pdf" },
				],
				isError: false,
				timestamp: 2,
			},
		];

		const result = transformMessages(messages, makeTextOnlyModel());
		const toolResult = result.find((m) => m.role === "toolResult") as ToolResultMessage;
		expect(toolResult.content).toHaveLength(3);
		expect(toolResult.content[0]).toEqual({ type: "text", text: "here's the result" });
		expect(toolResult.content[1]).toEqual({
			type: "text",
			text: "(tool image omitted: model does not support images)",
		});
		expect((toolResult.content[2] as { type: string; text: string }).text).toContain("result.pdf");
	});

	it("passes through user messages unchanged when model supports all attachment kinds", () => {
		const model: Model<"anthropic-messages"> = {
			id: "claude-sonnet-4-5",
			name: "Claude Sonnet 4.5",
			api: "anthropic-messages",
			provider: "anthropic",
			baseUrl: "https://api.anthropic.com",
			reasoning: true,
			input: ["text", "image", "document"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 200000,
			maxTokens: 8192,
		};

		const messages: Message[] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "review" },
					{ type: "document", mimeType: "application/pdf", data: "JVBERi0xLjQ=", fileName: "report.pdf" },
				],
				timestamp: 1,
			},
		];

		const [result] = transformMessages(messages, model) as [UserMessage];
		expect(result.content).toEqual(messages[0].content);
	});
});
