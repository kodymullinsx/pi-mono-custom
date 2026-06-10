import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./harness.ts";

describe("AgentSession attachment retry security", () => {
	const harnesses: Harness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("strips rejected document attachments before retrying", async () => {
		const rawDocumentData = Buffer.from("%PDF-1.7\nsecret attachment bytes").toString("base64");
		const harness = await createHarness({ settings: { retry: { enabled: true, maxRetries: 2, baseDelayMs: 1 } } });
		harnesses.push(harness);

		harness.setResponses([
			{
				...fauxAssistantMessage("", {
					stopReason: "error",
					errorMessage: "Document blocks are not supported by this local serializer",
				}),
				errorMetadata: { local: true, attachmentRetryTargets: ["document"] },
			},
			(context) => {
				const userMessage = context.messages.find((message) => message.role === "user");
				expect(userMessage).toBeDefined();
				expect(JSON.stringify(userMessage)).not.toContain(rawDocumentData);
				expect(JSON.stringify(userMessage)).toContain(
					"Attachment removed after the model rejected document attachments",
				);
				return fauxAssistantMessage("recovered");
			},
		]);

		await harness.session.prompt("review this document", {
			attachments: [
				{
					type: "document",
					mimeType: "application/pdf",
					fileName: "secret.pdf",
					data: rawDocumentData,
				},
			],
		});

		expect(harness.faux.state.callCount).toBe(2);
		expect(harness.eventsOfType("agent_end").map((event) => event.willRetry)).toEqual([true, false]);
		const retryStart = harness.eventsOfType("auto_retry_start")[0];
		expect(retryStart?.delayMs).toBe(0);
		expect(retryStart?.errorMessage).toContain("auto-retry removed document attachments");
		expect(JSON.stringify(harness.session.agent.state.messages)).not.toContain(rawDocumentData);
	});
});
