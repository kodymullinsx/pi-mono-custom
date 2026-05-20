import type { AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { streamProxy } from "../src/proxy.js";

function createUsage(): AssistantMessage["usage"] {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function createModel(): Model<"openai-responses"> {
	return {
		id: "mock",
		name: "mock",
		api: "openai-responses",
		provider: "openai",
		baseUrl: "https://example.invalid",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 8192,
		maxTokens: 2048,
	};
}

function createContext(): Context {
	return { messages: [], tools: [] };
}

function responseFromChunks(chunks: string[]): Response {
	const encoder = new TextEncoder();
	return new Response(
		new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(encoder.encode(chunk));
				}
				controller.close();
			},
		}),
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("streamProxy", () => {
	it("processes a final buffered SSE line without a trailing newline", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				responseFromChunks([
					'data: {"type":"start"}\n',
					`data: ${JSON.stringify({ type: "done", reason: "stop", usage: createUsage() })}`,
				]),
			),
		);

		const stream = streamProxy(createModel(), createContext(), {
			authToken: "token",
			proxyUrl: "https://proxy.example.invalid",
		});
		const events = [];
		for await (const event of stream) {
			events.push(event);
		}

		const result = await stream.result();
		expect(events.map((event) => event.type)).toEqual(["start", "done"]);
		expect(result.stopReason).toBe("stop");
	});

	it("emits an error result when the proxy response closes without a terminal event", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				responseFromChunks([
					'data: {"type":"start"}\n',
					'data: {"type":"text_start","contentIndex":0}\n',
					'data: {"type":"text_delta","contentIndex":0,"delta":"partial"}\n',
				]),
			),
		);

		const stream = streamProxy(createModel(), createContext(), {
			authToken: "token",
			proxyUrl: "https://proxy.example.invalid",
		});
		for await (const _event of stream) {
			// consume
		}

		const result = await stream.result();
		expect(result.stopReason).toBe("error");
		expect(result.errorMessage).toBe("Proxy stream ended without a terminal event");
	});

	it("emits an error result for malformed toolcall_end ordering", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				responseFromChunks(['data: {"type":"start"}\n', 'data: {"type":"toolcall_end","contentIndex":0}\n']),
			),
		);

		const stream = streamProxy(createModel(), createContext(), {
			authToken: "token",
			proxyUrl: "https://proxy.example.invalid",
		});
		for await (const _event of stream) {
			// consume
		}

		const result = await stream.result();
		expect(result.stopReason).toBe("error");
		expect(result.errorMessage).toBe("Received toolcall_end for non-toolCall content");
	});
});
