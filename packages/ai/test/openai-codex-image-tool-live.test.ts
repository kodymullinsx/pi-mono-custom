import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { complete, getModel } from "../src/index.js";
import type { AssistantMessage, Context, ProviderResponse, Tool, ToolResultMessage, Transport } from "../src/types.js";
import { resolveApiKey } from "./oauth.js";

type ToolChoiceMode = "auto" | "required" | "named";
type ResultKind = "image-only" | "text-and-image";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const runLiveCodexImageToolE2E = process.env.PI_LIVE_OPENAI_CODEX_IMAGE_TOOL_E2E === "1";

const matrix = (["sse", "websocket"] satisfies Transport[]).flatMap((transport) =>
	(["auto", "required", "named"] satisfies ToolChoiceMode[]).flatMap((toolChoice) =>
		(["image-only", "text-and-image"] satisfies ResultKind[]).map((resultKind) => ({
			transport,
			toolChoice,
			resultKind,
		})),
	),
);

async function resolveOpenAICodexToken(): Promise<string> {
	const token = await resolveApiKey("openai-codex");
	if (!token) {
		throw new Error("PI_LIVE_OPENAI_CODEX_IMAGE_TOOL_E2E is enabled but no openai-codex credential was found");
	}
	return token;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function redactedHeaders(headers: Record<string, string>): Record<string, string> {
	const safe: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		const lower = key.toLowerCase();
		if (lower.includes("authorization") || lower.includes("token") || lower.includes("cookie")) {
			safe[key] = "[redacted]";
		} else {
			safe[key] = value.slice(0, 200);
		}
	}
	return safe;
}

function summarizePayload(payload: unknown) {
	if (!isRecord(payload)) return { type: typeof payload };
	const input = Array.isArray(payload.input)
		? payload.input.map((item) => {
				if (!isRecord(item)) return { type: typeof item };
				if (item.type === "function_call_output") {
					const output = Array.isArray(item.output)
						? item.output.map((part) => {
								if (!isRecord(part)) return { type: typeof part };
								if (part.type === "input_image") {
									return { type: "input_image", image_url: "[data-url-redacted]" };
								}
								if (part.type === "input_text") {
									return { type: "input_text", text: String(part.text ?? "").slice(0, 160) };
								}
								return { type: part.type };
							})
						: typeof item.output;
					return { type: item.type, call_id: item.call_id, output };
				}
				if (item.type === "function_call") {
					return { type: item.type, call_id: item.call_id, id: item.id, name: item.name };
				}
				return { type: item.type, role: item.role };
			})
		: typeof payload.input;
	return {
		model: payload.model,
		transportPayload: payload.stream === true ? "stream" : payload.stream,
		tool_choice: payload.tool_choice,
		toolCount: Array.isArray(payload.tools) ? payload.tools.length : 0,
		input,
	};
}

function summarizeResponse(response: AssistantMessage) {
	return {
		stopReason: response.stopReason,
		errorMessage: response.errorMessage,
		responseId: response.responseId,
		text: response.content
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join(" ")
			.slice(0, 500),
		toolCalls: response.content
			.filter((block) => block.type === "toolCall")
			.map((block) => (block.type === "toolCall" ? { id: block.id, name: block.name } : null))
			.filter(Boolean),
	};
}

function formatDiagnostics(
	label: string,
	diagnostics: {
		transport: Transport;
		toolChoice: ToolChoiceMode;
		resultKind: ResultKind;
		payloads: unknown[];
		responses: ProviderResponse[];
		firstResponse?: AssistantMessage;
		secondResponse?: AssistantMessage;
	},
): string {
	return JSON.stringify(
		{
			label,
			transport: diagnostics.transport,
			toolChoice: diagnostics.toolChoice,
			resultKind: diagnostics.resultKind,
			providerResponses: diagnostics.responses.map((response) => ({
				status: response.status,
				headers: redactedHeaders(response.headers),
			})),
			payloads: diagnostics.payloads.map(summarizePayload),
			firstResponse: diagnostics.firstResponse ? summarizeResponse(diagnostics.firstResponse) : undefined,
			secondResponse: diagnostics.secondResponse ? summarizeResponse(diagnostics.secondResponse) : undefined,
		},
		null,
		2,
	);
}

function applyFirstRequestToolChoice(payload: unknown, toolChoice: ToolChoiceMode, toolName: string) {
	if (!isRecord(payload) || toolChoice === "auto") return undefined;
	return {
		...payload,
		tool_choice: toolChoice === "required" ? "required" : { type: "function", name: toolName },
	};
}

describe.skipIf(!runLiveCodexImageToolE2E)("OpenAI Codex GPT-5.5 live image tool diagnostics", () => {
	it.each(matrix)(
		"handles $resultKind results over $transport with $toolChoice tool choice",
		{ retry: 0, timeout: 120000 },
		async ({ transport, toolChoice, resultKind }) => {
			const apiKey = await resolveOpenAICodexToken();
			const model = getModel("openai-codex", "gpt-5.5");
			const imagePath = join(__dirname, "data", "red-circle.png");
			const base64Image = readFileSync(imagePath).toString("base64");
			const getImageSchema = Type.Object({});
			const getImageTool: Tool<typeof getImageSchema> = {
				name: "get_circle",
				description: "Returns a red circle image for visualization.",
				parameters: getImageSchema,
			};
			const diagnostics = {
				transport,
				toolChoice,
				resultKind,
				payloads: [] as unknown[],
				responses: [] as ProviderResponse[],
				firstResponse: undefined as AssistantMessage | undefined,
				secondResponse: undefined as AssistantMessage | undefined,
			};
			let requestCount = 0;
			const finalAnswerInstruction =
				resultKind === "text-and-image"
					? "After the tool result is provided, your final answer must include the exact phrase 'diameter of 100 pixels' and must also mention the red circle."
					: "After the tool result is provided, describe the color and shape you see.";
			const context: Context = {
				systemPrompt: "You are a helpful assistant that uses tools when asked.",
				messages: [
					{
						role: "user",
						content: `Call get_circle exactly once. ${finalAnswerInstruction}`,
						timestamp: Date.now(),
					},
				],
				tools: [getImageTool],
			};
			const options = {
				apiKey,
				transport,
				onPayload: (payload: unknown) => {
					requestCount += 1;
					const nextPayload =
						requestCount === 1 ? applyFirstRequestToolChoice(payload, toolChoice, "get_circle") : undefined;
					diagnostics.payloads.push(nextPayload ?? payload);
					return nextPayload;
				},
				onResponse: (response: ProviderResponse) => {
					diagnostics.responses.push(response);
				},
			};

			diagnostics.firstResponse = await complete(model, context, options);
			expect(
				diagnostics.firstResponse.stopReason,
				formatDiagnostics("first response should request get_circle", diagnostics),
			).toBe("toolUse");

			const toolCall = diagnostics.firstResponse.content.find((block) => block.type === "toolCall");
			expect(toolCall?.type, formatDiagnostics("first response should contain tool call", diagnostics)).toBe(
				"toolCall",
			);
			if (!toolCall || toolCall.type !== "toolCall") {
				throw new Error(formatDiagnostics("missing tool call", diagnostics));
			}
			expect(toolCall.name, formatDiagnostics("first response should call get_circle", diagnostics)).toBe(
				"get_circle",
			);

			context.messages.push(diagnostics.firstResponse);
			const toolContent: ToolResultMessage["content"] =
				resultKind === "image-only"
					? [{ type: "image", data: base64Image, mimeType: "image/png" }]
					: [
							{
								type: "text",
								text: "This is a geometric shape with a diameter of 100 pixels. Include this exact diameter phrase in the final answer.",
							},
							{ type: "image", data: base64Image, mimeType: "image/png" },
						];
			context.messages.push({
				role: "toolResult",
				toolCallId: toolCall.id,
				toolName: toolCall.name,
				content: toolContent,
				isError: false,
				timestamp: Date.now(),
			});

			diagnostics.secondResponse = await complete(model, context, options);
			expect(
				diagnostics.secondResponse.stopReason,
				formatDiagnostics("second response should describe tool result", diagnostics),
			).toBe("stop");
			expect(
				diagnostics.secondResponse.errorMessage,
				formatDiagnostics("second response should not error", diagnostics),
			).toBeFalsy();

			const responseText = diagnostics.secondResponse.content
				.filter((block) => block.type === "text")
				.map((block) => block.text)
				.join(" ")
				.toLowerCase();
			expect(responseText, formatDiagnostics("second response should mention red", diagnostics)).toContain("red");
			expect(responseText, formatDiagnostics("second response should mention circle", diagnostics)).toContain(
				"circle",
			);
			if (resultKind === "text-and-image") {
				expect(
					responseText.match(/diameter|100|pixel/),
					formatDiagnostics("second response should use tool text", diagnostics),
				).toBeTruthy();
			}
		},
	);
});
