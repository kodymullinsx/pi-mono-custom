import { unlinkSync, writeFileSync } from "node:fs";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, getMessageText, type Harness } from "./harness.js";

function createPdfReadTool(runLog: Array<{ path: string; pages?: string }>): AgentTool {
	return {
		name: "read",
		label: "Read",
		description: "Test PDF read tool",
		parameters: Type.Object({
			path: Type.String(),
			pages: Type.Optional(Type.String()),
		}),
		execute: async (_toolCallId, params) => {
			const input = params as { path: string; pages?: string };
			runLog.push({ path: input.path, pages: input.pages });

			const firstPage = input.pages === "11-12" ? 11 : input.pages === "1-10" ? 1 : 1;
			const lastPage = input.pages === "11-12" ? 12 : input.pages === "1-10" ? 10 : 10;
			const renderedPages = lastPage - firstPage + 1;
			const rangeSize = renderedPages;
			const previousRange =
				firstPage > 1
					? firstPage === 11
						? "1-10"
						: `${Math.max(1, firstPage - rangeSize)}-${firstPage - 1}`
					: undefined;
			const nextRange =
				lastPage < 12
					? lastPage === 10
						? "11-12"
						: `${lastPage + 1}-${Math.min(12, lastPage + rangeSize)}`
					: undefined;

			return {
				content: [
					{ type: "text", text: `Showing PDF pages ${firstPage}-${lastPage}` },
					{ type: "image", mimeType: "image/png", data: "ZmFrZQ==" },
				],
				details: {
					pdf: {
						pageCount: 12,
						renderedPages,
						firstPage,
						lastPage,
						rangeSize,
						previousRange,
						nextRange,
					},
				},
			};
		},
	};
}

describe("AgentSession PDF read navigation", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("resolves next and prev to concrete numeric ranges and records those ranges in history", async () => {
		const readRuns: Array<{ path: string; pages?: string }> = [];
		const harness = await createHarness({ tools: [createPdfReadTool(readRuns)] });
		harnesses.push(harness);
		const pdfPath = `${harness.tempDir}/sample.pdf`;
		writeFileSync(pdfPath, "%PDF-1.4\nfake");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath })], { stopReason: "toolUse" }),
			fauxAssistantMessage("first done"),
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath, pages: "next" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("second done"),
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath, pages: "prev" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("third done"),
		]);

		await harness.session.prompt("start");
		await harness.session.prompt("continue");
		await harness.session.prompt("back");

		expect(readRuns).toEqual([
			{ path: pdfPath, pages: undefined },
			{ path: pdfPath, pages: "11-12" },
			{ path: pdfPath, pages: "1-10" },
		]);

		const readStartEvents = harness
			.eventsOfType("tool_execution_start")
			.filter((event) => event.toolName === "read")
			.map((event) => event.args as { pages?: string });
		expect(readStartEvents.map((args) => args.pages)).toEqual([undefined, "11-12", "1-10"]);

		const assistantToolCalls = harness.session.messages
			.filter(
				(
					message,
				): message is Extract<
					(typeof harness.session.messages)[number],
					{ role: "assistant"; content: Array<unknown> }
				> => message.role === "assistant",
			)
			.flatMap((message) =>
				message.content.filter(
					(
						content,
					): content is Extract<
						(typeof message.content)[number],
						{ type: "toolCall"; arguments: { pages?: string } }
					> => content.type === "toolCall",
				),
			);
		expect(assistantToolCalls.map((toolCall) => toolCall.arguments.pages)).toEqual([undefined, "11-12", "1-10"]);
	});

	it("blocks pages=next when no prior PDF range exists", async () => {
		const readRuns: Array<{ path: string; pages?: string }> = [];
		const harness = await createHarness({ tools: [createPdfReadTool(readRuns)] });
		harnesses.push(harness);
		const pdfPath = `${harness.tempDir}/sample.pdf`;
		writeFileSync(pdfPath, "%PDF-1.4\nfake");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath, pages: "next" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		await harness.session.prompt("continue");

		expect(readRuns).toEqual([]);
		const toolResult = harness.session.messages.find((message) => message.role === "toolResult");
		expect(getMessageText(toolResult)).toContain('Start with read(path) or an explicit pages="N-M" range first.');
	});

	it("records PDF navigation state even when the read result is text-only", async () => {
		const readRuns: Array<{ path: string; pages?: string }> = [];
		const harness = await createHarness({
			tools: [
				{
					name: "read",
					label: "Read",
					description: "Test PDF read tool",
					parameters: Type.Object({
						path: Type.String(),
						pages: Type.Optional(Type.String()),
					}),
					execute: async (_toolCallId, params) => {
						const input = params as { path: string; pages?: string };
						readRuns.push({ path: input.path, pages: input.pages });
						const firstPage = input.pages === "11-12" ? 11 : 1;
						const lastPage = input.pages === "11-12" ? 12 : 10;
						return {
							content: [{ type: "text", text: `Showing PDF pages ${firstPage}-${lastPage}` }],
							details: {
								pdf: {
									pageCount: 12,
									renderedPages: 0,
									firstPage,
									lastPage,
									rangeSize: lastPage - firstPage + 1,
									previousRange: firstPage > 1 ? "1-10" : undefined,
									nextRange: lastPage < 12 ? "11-12" : undefined,
								},
							},
						};
					},
				},
			],
		});
		harnesses.push(harness);
		const pdfPath = `${harness.tempDir}/sample.pdf`;
		writeFileSync(pdfPath, "%PDF-1.4\nfake");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath })], { stopReason: "toolUse" }),
			fauxAssistantMessage("first done"),
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath, pages: "next" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("second done"),
		]);

		await harness.session.prompt("start");
		await harness.session.prompt("continue");

		expect(readRuns).toEqual([
			{ path: pdfPath, pages: undefined },
			{ path: pdfPath, pages: "11-12" },
		]);
	});

	it("invalidates next/prev state when the PDF mtime changes", async () => {
		const readRuns: Array<{ path: string; pages?: string }> = [];
		const harness = await createHarness({ tools: [createPdfReadTool(readRuns)] });
		harnesses.push(harness);
		const pdfPath = `${harness.tempDir}/sample.pdf`;
		writeFileSync(pdfPath, "%PDF-1.4\nfake");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath })], { stopReason: "toolUse" }),
			fauxAssistantMessage("first done"),
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath, pages: "next" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("second done"),
		]);

		await harness.session.prompt("start");
		writeFileSync(pdfPath, "%PDF-1.4\nchanged");
		await harness.session.prompt("continue");

		expect(readRuns).toEqual([{ path: pdfPath, pages: undefined }]);
		const toolResults = harness.session.messages.filter((message) => message.role === "toolResult");
		expect(getMessageText(toolResults[toolResults.length - 1])).toContain(
			"The PDF changed since the last paged read.",
		);
	});

	it("blocks pages=next with an explicit revalidation error when the PDF can no longer be statted", async () => {
		const readRuns: Array<{ path: string; pages?: string }> = [];
		const harness = await createHarness({ tools: [createPdfReadTool(readRuns)] });
		harnesses.push(harness);
		const pdfPath = `${harness.tempDir}/sample.pdf`;
		writeFileSync(pdfPath, "%PDF-1.4\nfake");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath })], { stopReason: "toolUse" }),
			fauxAssistantMessage("first done"),
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath, pages: "next" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("second done"),
		]);

		await harness.session.prompt("start");
		unlinkSync(pdfPath);
		await harness.session.prompt("continue");

		expect(readRuns).toEqual([{ path: pdfPath, pages: undefined }]);
		const toolResults = harness.session.messages.filter((message) => message.role === "toolResult");
		const lastResult = getMessageText(toolResults[toolResults.length - 1]);
		expect(lastResult).toContain('Could not revalidate the prior PDF range for pages="next"/"prev":');
		expect(lastResult).not.toContain('Invalid pages parameter: "next"');
	});
});
