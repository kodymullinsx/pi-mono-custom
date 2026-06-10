import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxToolCall } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.ts";

describe("AgentSession read attachment and PDF navigation", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("moves read image attachments to hidden supplemental messages and resolves pages=next", async () => {
		const seenPages: Array<string | undefined> = [];
		let run = 0;
		const readTool: AgentTool = {
			name: "read",
			label: "Read",
			description: "Read a file",
			parameters: Type.Object({
				path: Type.String(),
				pages: Type.Optional(Type.String()),
			}),
			execute: async (_toolCallId, params) => {
				run++;
				const pages =
					typeof params === "object" && params !== null ? (params as { pages?: string }).pages : undefined;
				seenPages.push(pages);
				const firstPage = pages === "3-4" ? 3 : 1;
				const lastPage = pages === "3-4" ? 4 : 2;
				return {
					content: [
						{ type: "text", text: `Showing PDF pages ${firstPage}-${lastPage}.` },
						{ type: "image", mimeType: "image/png", data: Buffer.from(`page-${run}`).toString("base64") },
					],
					details: {
						pdf: {
							firstPage,
							lastPage,
							rangeSize: 2,
							pageCount: 4,
						},
					},
				};
			},
		};
		const harness = await createHarness({ tools: [readTool] });
		harnesses.push(harness);
		const pdfPath = join(harness.tempDir, "sample.pdf");
		writeFileSync(pdfPath, "%PDF-1.7\nfake");

		harness.setResponses([
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath, pages: "1-2" })], { stopReason: "toolUse" }),
			fauxAssistantMessage([fauxToolCall("read", { path: pdfPath, pages: "next" })], { stopReason: "toolUse" }),
			fauxAssistantMessage("done"),
		]);

		await harness.session.prompt("inspect the PDF");

		expect(seenPages).toEqual(["1-2", "3-4"]);
		const toolResults = harness.session.messages.filter((message) => message.role === "toolResult");
		expect(toolResults).toHaveLength(2);
		for (const message of toolResults) {
			expect(message.content).toEqual([{ type: "text", text: expect.stringContaining("Showing PDF pages") }]);
		}
		const attachmentMessages = harness.session.messages.filter(
			(
				message,
			): message is Extract<(typeof harness.session.messages)[number], { role: "custom"; customType: string }> =>
				message.role === "custom" && message.customType === "tool_attachment",
		);
		expect(attachmentMessages).toHaveLength(2);
		expect(attachmentMessages.every((message) => message.display === false)).toBe(true);
		expect(
			attachmentMessages.every(
				(message) => typeof message.content !== "string" && message.content[0]?.type === "image",
			),
		).toBe(true);
	});
});
