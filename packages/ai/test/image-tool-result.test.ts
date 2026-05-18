import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import type { Api, AssistantMessage, Context, Model, Tool, ToolResultMessage } from "../src/index.js";
import { complete, getModel } from "../src/index.js";
import type { StreamOptions } from "../src/types.js";

type StreamOptionsWithExtras = StreamOptions & Record<string, unknown>;

import { hasAzureOpenAICredentials, resolveAzureDeploymentName } from "./azure-utils.js";
import { hasBedrockCredentials } from "./bedrock-utils.js";
import { resolveApiKey } from "./oauth.js";

const liveImageToolResultE2E = process.env.PI_LIVE_IMAGE_TOOL_RESULT_E2E === "1";
const liveOpenAICodexImageToolE2E = process.env.PI_LIVE_OPENAI_CODEX_IMAGE_TOOL_E2E === "1";
const runOpenAICodexImageToolE2E = liveImageToolResultE2E || liveOpenAICodexImageToolE2E;

async function resolveRequiredApiKey(provider: string): Promise<string> {
	const token = await resolveApiKey(provider);
	if (!token) {
		const gate =
			provider === "openai-codex" && liveOpenAICodexImageToolE2E
				? "PI_LIVE_OPENAI_CODEX_IMAGE_TOOL_E2E"
				: "PI_LIVE_IMAGE_TOOL_RESULT_E2E";
		throw new Error(`${gate} is enabled but no ${provider} credential was found`);
	}
	return token;
}

function summarizeResponse(response: AssistantMessage): string {
	const text = response.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join(" ")
		.slice(0, 500);
	const toolCalls = response.content
		.filter((block) => block.type === "toolCall")
		.map((block) => block.name)
		.join(", ");
	return [
		`stopReason=${response.stopReason}`,
		response.errorMessage ? `error=${response.errorMessage}` : undefined,
		response.responseId ? `responseId=${response.responseId}` : undefined,
		toolCalls ? `toolCalls=${toolCalls}` : undefined,
		text ? `text=${text}` : undefined,
	]
		.filter(Boolean)
		.join("; ");
}

function expectStopReason(response: AssistantMessage, expected: AssistantMessage["stopReason"], label: string) {
	expect(response.stopReason, `${label}: ${summarizeResponse(response)}`).toBe(expected);
}

/**
 * Test that tool results containing only images work correctly across all providers.
 * This verifies that:
 * 1. Tool results can contain image content blocks
 * 2. Providers correctly pass images from tool results to the LLM
 * 3. The LLM can see and describe images returned by tools
 */
async function handleToolWithImageResult<TApi extends Api>(model: Model<TApi>, options?: StreamOptionsWithExtras) {
	// Check if the model supports images
	if (!model.input.includes("image")) {
		console.log(`Skipping tool image result test - model ${model.id} doesn't support images`);
		return;
	}

	// Read the test image
	const imagePath = join(__dirname, "data", "red-circle.png");
	const imageBuffer = readFileSync(imagePath);
	const base64Image = imageBuffer.toString("base64");

	// Define a tool that returns only an image (no text)
	const getImageSchema = Type.Object({});
	const getImageTool: Tool<typeof getImageSchema> = {
		name: "get_circle",
		description: "Returns a circle image for visualization",
		parameters: getImageSchema,
	};

	const context: Context = {
		systemPrompt: "You are a helpful assistant that uses tools when asked.",
		messages: [
			{
				role: "user",
				content: "Call the get_circle tool to get an image, and describe what you see, shapes, colors, etc.",
				timestamp: Date.now(),
			},
		],
		tools: [getImageTool],
	};

	// First request - LLM should call the tool
	const firstResponse = await complete(model, context, options);
	expectStopReason(firstResponse, "toolUse", `${model.provider}:${model.id} first request`);

	// Find the tool call
	const toolCall = firstResponse.content.find((b) => b.type === "toolCall");
	expect(toolCall).toBeTruthy();
	if (!toolCall || toolCall.type !== "toolCall") {
		throw new Error("Expected tool call");
	}
	expect(toolCall.name).toBe("get_circle");

	// Add the tool call to context
	context.messages.push(firstResponse);

	// Create tool result with ONLY an image (no text)
	const toolResult: ToolResultMessage = {
		role: "toolResult",
		toolCallId: toolCall.id,
		toolName: toolCall.name,
		content: [
			{
				type: "image",
				data: base64Image,
				mimeType: "image/png",
			},
		],
		isError: false,
		timestamp: Date.now(),
	};

	context.messages.push(toolResult);

	// Second request - LLM should describe the image from the tool result
	const secondResponse = await complete(model, context, options);
	expectStopReason(secondResponse, "stop", `${model.provider}:${model.id} image-only result`);
	expect(secondResponse.errorMessage).toBeFalsy();

	// Verify the LLM can see and describe the image
	const textContent = secondResponse.content.find((b) => b.type === "text");
	expect(textContent).toBeTruthy();
	if (textContent && textContent.type === "text") {
		const lowerContent = textContent.text.toLowerCase();
		// Should mention red and circle since that's what the image shows
		expect(lowerContent).toContain("red");
		expect(lowerContent).toContain("circle");
	}
}

/**
 * Test that tool results containing both text and images work correctly across all providers.
 * This verifies that:
 * 1. Tool results can contain mixed content blocks (text + images)
 * 2. Providers correctly pass both text and images from tool results to the LLM
 * 3. The LLM can see both the text and images in tool results
 */
async function handleToolWithTextAndImageResult<TApi extends Api>(
	model: Model<TApi>,
	options?: StreamOptionsWithExtras,
) {
	// Check if the model supports images
	if (!model.input.includes("image")) {
		console.log(`Skipping tool text+image result test - model ${model.id} doesn't support images`);
		return;
	}

	// Read the test image
	const imagePath = join(__dirname, "data", "red-circle.png");
	const imageBuffer = readFileSync(imagePath);
	const base64Image = imageBuffer.toString("base64");

	// Define a tool that returns both text and an image
	const getImageSchema = Type.Object({});
	const getImageTool: Tool<typeof getImageSchema> = {
		name: "get_circle_with_description",
		description: "Returns a circle image with a text description",
		parameters: getImageSchema,
	};

	const context: Context = {
		systemPrompt: "You are a helpful assistant that uses tools when asked.",
		messages: [
			{
				role: "user",
				content:
					"Use the get_circle_with_description tool and tell me what you learned. Also say what color the shape is.",
				timestamp: Date.now(),
			},
		],
		tools: [getImageTool],
	};

	// First request - LLM should call the tool
	const firstResponse = await complete(model, context, options);
	expectStopReason(firstResponse, "toolUse", `${model.provider}:${model.id} first request`);

	// Find the tool call
	const toolCall = firstResponse.content.find((b) => b.type === "toolCall");
	expect(toolCall).toBeTruthy();
	if (!toolCall || toolCall.type !== "toolCall") {
		throw new Error("Expected tool call");
	}
	expect(toolCall.name).toBe("get_circle_with_description");

	// Add the tool call to context
	context.messages.push(firstResponse);

	// Create tool result with BOTH text and image
	const toolResult: ToolResultMessage = {
		role: "toolResult",
		toolCallId: toolCall.id,
		toolName: toolCall.name,
		content: [
			{
				type: "text",
				text: "This is a geometric shape with specific properties: it has a diameter of 100 pixels.",
			},
			{
				type: "image",
				data: base64Image,
				mimeType: "image/png",
			},
		],
		isError: false,
		timestamp: Date.now(),
	};

	context.messages.push(toolResult);

	// Second request - LLM should describe both the text and image from the tool result
	const secondResponse = await complete(model, context, options);
	expectStopReason(secondResponse, "stop", `${model.provider}:${model.id} text+image result`);
	expect(secondResponse.errorMessage).toBeFalsy();

	// Verify the LLM can see both text and image
	const textContent = secondResponse.content.find((b) => b.type === "text");
	expect(textContent).toBeTruthy();
	if (textContent && textContent.type === "text") {
		const lowerContent = textContent.text.toLowerCase();
		// Should mention details from the text (diameter/pixels)
		expect(lowerContent.match(/diameter|100|pixel/)).toBeTruthy();
		// Should also mention the visual properties (red and circle)
		expect(lowerContent).toContain("red");
		expect(lowerContent).toContain("circle");
	}
}

describe("Tool Results with Images", () => {
	describe.skipIf(!liveImageToolResultE2E || !process.env.GEMINI_API_KEY)("Google Provider (gemini-2.5-flash)", () => {
		const llm = getModel("google", "gemini-2.5-flash");

		it("should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
			await handleToolWithImageResult(llm);
		});

		it("should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
			await handleToolWithTextAndImageResult(llm);
		});
	});

	describe.skipIf(!liveImageToolResultE2E || !process.env.OPENAI_API_KEY)(
		"OpenAI Completions Provider (gpt-4o-mini)",
		() => {
			const { compat: _compat, ...baseModel } = getModel("openai", "gpt-4o-mini");
			void _compat;
			const llm: Model<"openai-completions"> = {
				...baseModel,
				api: "openai-completions",
			};

			it("should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithImageResult(llm);
			});

			it("should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithTextAndImageResult(llm);
			});
		},
	);

	describe.skipIf(!liveImageToolResultE2E || !process.env.OPENAI_API_KEY)(
		"OpenAI Responses Provider (gpt-5-mini)",
		() => {
			const llm = getModel("openai", "gpt-5-mini");

			it("should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithImageResult(llm);
			});

			it("should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithTextAndImageResult(llm);
			});
		},
	);

	describe.skipIf(!liveImageToolResultE2E || !hasAzureOpenAICredentials())(
		"Azure OpenAI Responses Provider (gpt-4o-mini)",
		() => {
			const llm = getModel("azure-openai-responses", "gpt-4o-mini");
			const azureDeploymentName = resolveAzureDeploymentName(llm.id);
			const azureOptions = azureDeploymentName ? { azureDeploymentName } : {};

			it("should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithImageResult(llm, azureOptions);
			});

			it("should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithTextAndImageResult(llm, azureOptions);
			});
		},
	);

	describe.skipIf(!liveImageToolResultE2E || !process.env.ANTHROPIC_API_KEY)(
		"Anthropic Provider (claude-haiku-4-5)",
		() => {
			const model = getModel("anthropic", "claude-haiku-4-5");

			it("should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithImageResult(model);
			});

			it("should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithTextAndImageResult(model);
			});
		},
	);

	describe.skipIf(!liveImageToolResultE2E || !process.env.OPENROUTER_API_KEY)("OpenRouter Provider (glm-4.5v)", () => {
		const llm = getModel("openrouter", "z-ai/glm-4.5v");

		it("should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
			await handleToolWithImageResult(llm);
		});

		it("should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
			await handleToolWithTextAndImageResult(llm);
		});
	});

	describe.skipIf(!liveImageToolResultE2E || !process.env.MISTRAL_API_KEY)("Mistral Provider (pixtral-12b)", () => {
		const llm = getModel("mistral", "pixtral-12b");

		it("should handle tool result with only image", { retry: 5, timeout: 30000 }, async () => {
			await handleToolWithImageResult(llm);
		});

		it("should handle tool result with text and image", { retry: 5, timeout: 30000 }, async () => {
			await handleToolWithTextAndImageResult(llm);
		});
	});

	describe.skipIf(!liveImageToolResultE2E || !process.env.KIMI_API_KEY)(
		"Kimi For Coding Provider (kimi-for-coding)",
		() => {
			const llm = getModel("kimi-coding", "kimi-for-coding");

			it("should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithImageResult(llm);
			});

			it("should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithTextAndImageResult(llm);
			});
		},
	);

	describe.skipIf(!liveImageToolResultE2E || !process.env.AI_GATEWAY_API_KEY)(
		"Vercel AI Gateway Provider (google/gemini-2.5-flash)",
		() => {
			const llm = getModel("vercel-ai-gateway", "google/gemini-2.5-flash");

			it("should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithImageResult(llm);
			});

			it("should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithTextAndImageResult(llm);
			});
		},
	);

	describe.skipIf(!liveImageToolResultE2E || !hasBedrockCredentials())(
		"Amazon Bedrock Provider (claude-sonnet-4-5)",
		() => {
			const llm = getModel("amazon-bedrock", "global.anthropic.claude-sonnet-4-5-20250929-v1:0");

			it("should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithImageResult(llm);
			});

			it("should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
				await handleToolWithTextAndImageResult(llm);
			});
		},
	);

	// =========================================================================
	// OAuth-based providers (credentials from ~/.pi/agent/oauth.json)
	// =========================================================================

	describe.skipIf(!liveImageToolResultE2E)("Anthropic OAuth Provider (claude-sonnet-4-5)", () => {
		const model = getModel("anthropic", "claude-sonnet-4-5");

		it("should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
			const apiKey = await resolveRequiredApiKey("anthropic");
			await handleToolWithImageResult(model, { apiKey });
		});

		it("should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
			const apiKey = await resolveRequiredApiKey("anthropic");
			await handleToolWithTextAndImageResult(model, { apiKey });
		});
	});

	describe.skipIf(!liveImageToolResultE2E)("GitHub Copilot Provider", () => {
		it("gpt-4o - should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
			const apiKey = await resolveRequiredApiKey("github-copilot");
			const llm = getModel("github-copilot", "gpt-4o");
			await handleToolWithImageResult(llm, { apiKey });
		});

		it("gpt-4o - should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
			const apiKey = await resolveRequiredApiKey("github-copilot");
			const llm = getModel("github-copilot", "gpt-4o");
			await handleToolWithTextAndImageResult(llm, { apiKey });
		});

		it("claude-sonnet-4 - should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
			const apiKey = await resolveRequiredApiKey("github-copilot");
			const llm = getModel("github-copilot", "claude-sonnet-4");
			await handleToolWithImageResult(llm, { apiKey });
		});

		it("claude-sonnet-4 - should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
			const apiKey = await resolveRequiredApiKey("github-copilot");
			const llm = getModel("github-copilot", "claude-sonnet-4");
			await handleToolWithTextAndImageResult(llm, { apiKey });
		});
	});

	describe.skipIf(!liveImageToolResultE2E)("Google Gemini CLI Provider", () => {
		it("gemini-2.5-flash - should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
			const apiKey = await resolveRequiredApiKey("google-gemini-cli");
			const llm = getModel("google-gemini-cli", "gemini-2.5-flash");
			await handleToolWithImageResult(llm, { apiKey });
		});

		it("gemini-2.5-flash - should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
			const apiKey = await resolveRequiredApiKey("google-gemini-cli");
			const llm = getModel("google-gemini-cli", "gemini-2.5-flash");
			await handleToolWithTextAndImageResult(llm, { apiKey });
		});
	});

	describe.skipIf(!liveImageToolResultE2E)("Google Antigravity Provider", () => {
		it("gemini-3-flash - should handle tool result with only image", { retry: 3, timeout: 30000 }, async () => {
			const apiKey = await resolveRequiredApiKey("google-antigravity");
			const llm = getModel("google-antigravity", "gemini-3-flash");
			await handleToolWithImageResult(llm, { apiKey });
		});

		it("gemini-3-flash - should handle tool result with text and image", { retry: 3, timeout: 30000 }, async () => {
			const apiKey = await resolveRequiredApiKey("google-antigravity");
			const llm = getModel("google-antigravity", "gemini-3-flash");
			await handleToolWithTextAndImageResult(llm, { apiKey });
		});

		/** These two don't work, the model simply won't call the tool, works in pi
		it.skipIf(!antigravityToken)(
			"claude-sonnet-4-5 - should handle tool result with only image",
			{ retry: 3, timeout: 30000 },
			async () => {
				const llm = getModel("google-antigravity", "claude-sonnet-4-5");
				await handleToolWithImageResult(llm, { apiKey: antigravityToken });
			},
		);

		it.skipIf(!antigravityToken)(
			"claude-sonnet-4-5 - should handle tool result with text and image",
			{ retry: 3, timeout: 30000 },
			async () => {
				const llm = getModel("google-antigravity", "claude-sonnet-4-5");
				await handleToolWithTextAndImageResult(llm, { apiKey: antigravityToken });
			},
		);**/

		// Note: gpt-oss-120b-medium does not support images, so not tested here
	});

	describe.skipIf(!runOpenAICodexImageToolE2E)("OpenAI Codex Provider", () => {
		it("gpt-5.5 - should handle tool result with only image", { retry: 0, timeout: 60000 }, async () => {
			const apiKey = await resolveRequiredApiKey("openai-codex");
			const llm = getModel("openai-codex", "gpt-5.5");
			await handleToolWithImageResult(llm, { apiKey });
		});

		it("gpt-5.5 - should handle tool result with text and image", { retry: 0, timeout: 60000 }, async () => {
			const apiKey = await resolveRequiredApiKey("openai-codex");
			const llm = getModel("openai-codex", "gpt-5.5");
			await handleToolWithTextAndImageResult(llm, { apiKey });
		});
	});
});
