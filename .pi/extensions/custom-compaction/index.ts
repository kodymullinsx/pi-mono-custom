import { complete } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { convertToLlm, serializeConversation } from "@mariozechner/pi-coding-agent";

import {
	buildArtifactDetails,
	clearArtifactIndexState,
	createArtifactIndexState,
	getRecentArtifactObservations,
	hydrateArtifactIndexFromBranchEntries,
	recordToolExecutionEnd,
	rememberToolExecutionStart,
} from "./artifact-index.ts";
import { loadConfig } from "./config.ts";
import { shapeContextMessages } from "./context-shaping.ts";
import { writePayloadCaptureArtifact } from "./payload-capture.ts";
import { appendDeterministicSummarySections, buildSummaryPromptText, computeFileLists } from "./summary-input.ts";

const config = loadConfig();

export default function (pi: ExtensionAPI) {
	const artifactState = createArtifactIndexState();
	let lastContextMessages: unknown[] = [];
	let captureSequence = 0;

	function resetState() {
		clearArtifactIndexState(artifactState);
		lastContextMessages = [];
		captureSequence = 0;
	}

	pi.on("session_start", async (_event, ctx) => {
		resetState();
		if (config.payloadCapture.enabled && config.payloadCapture.outputDir) {
			ctx.ui.notify(`Custom compaction payload capture enabled at ${config.payloadCapture.outputDir}`, "info");
		}
	});

	pi.on("session_shutdown", async () => {
		resetState();
	});

	pi.on("tool_execution_start", async (event) => {
		rememberToolExecutionStart(artifactState, event);
	});

	pi.on("tool_execution_end", async (event) => {
		recordToolExecutionEnd(artifactState, event, config.artifactIndex);
	});

	pi.on("context", async (event, ctx) => {
		const messages = config.contextShaping.enabled
			? shapeContextMessages(event.messages, config.contextShaping.customTypePrefix)
			: event.messages;

		if (config.payloadCapture.enabled) {
			lastContextMessages = messages;
		}

		if (config.contextShaping.enabled && messages !== event.messages) {
			ctx.ui.notify("Custom compaction applied guarded context shaping", "info");
			return { messages };
		}

		return;
	});

	pi.on("before_provider_request", async (event, ctx) => {
		if (!config.payloadCapture.enabled || !config.payloadCapture.outputDir) return;
		captureSequence += 1;
		await writePayloadCaptureArtifact({
			outputDir: config.payloadCapture.outputDir,
			runLabel: config.payloadCapture.runLabel,
			sequence: captureSequence,
			sessionId: ctx.sessionManager.getSessionId(),
			sessionFile: ctx.sessionManager.getSessionFile(),
			contextMessages: lastContextMessages,
			payload: event.payload,
		});
	});

	pi.on("session_before_compact", async (event, ctx) => {
		const { preparation, branchEntries, signal } = event;
		const { messagesToSummarize, turnPrefixMessages, tokensBefore, firstKeptEntryId, previousSummary, fileOps } = preparation;

		hydrateArtifactIndexFromBranchEntries(artifactState, branchEntries, config.artifactIndex);
		const artifacts = getRecentArtifactObservations(artifactState, config.artifactIndex.maxSummaryEntries);
		const { readFiles, modifiedFiles } = computeFileLists(fileOps);

		const model = ctx.modelRegistry.find(config.summary.provider, config.summary.modelId);
		if (!model) {
			ctx.ui.notify(
				`Could not find ${config.summary.provider}/${config.summary.modelId}, using default compaction`,
				"warning",
			);
			return;
		}

		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok) {
			ctx.ui.notify(`Compaction auth failed: ${auth.error}`, "warning");
			return;
		}
		if (!auth.apiKey) {
			ctx.ui.notify(`No API key for ${model.provider}, using default compaction`, "warning");
			return;
		}

		const allMessages = [...messagesToSummarize, ...turnPrefixMessages];
		const conversationText = serializeConversation(convertToLlm(allMessages));
		const promptText = buildSummaryPromptText({
			conversationText,
			previousSummary,
			readFiles,
			modifiedFiles,
			artifacts,
		});

		ctx.ui.notify(
			`Custom compaction: summarizing ${allMessages.length} messages (${tokensBefore.toLocaleString()} tokens) with ${model.id}...`,
			"info",
		);

		try {
			const response = await complete(
				model,
				{
					messages: [
						{
							role: "user" as const,
							content: [{ type: "text" as const, text: promptText }],
							timestamp: Date.now(),
						},
					],
				},
				{
					apiKey: auth.apiKey,
					headers: auth.headers,
					maxTokens: config.summary.maxTokens,
					signal,
				},
			);

			const summaryText = response.content
				.filter((chunk): chunk is { type: "text"; text: string } => chunk.type === "text")
				.map((chunk) => chunk.text)
				.join("\n")
				.trim();

			if (!summaryText) {
				if (!signal.aborted) ctx.ui.notify("Compaction summary was empty, using default compaction", "warning");
				return;
			}

			return {
				compaction: {
					summary: appendDeterministicSummarySections(summaryText, { readFiles, modifiedFiles, artifacts }),
					firstKeptEntryId,
					tokensBefore,
					details: buildArtifactDetails(artifactState),
				},
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (!signal.aborted) ctx.ui.notify(`Compaction failed: ${message}`, "error");
			return;
		}
	});
}
