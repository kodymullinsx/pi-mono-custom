import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Agent } from "@earendil-works/pi-agent-core";
import {
	AttachmentSerializationError,
	type FauxProviderRegistration,
	fauxAssistantMessage,
	registerFauxProvider,
} from "@earendil-works/pi-ai";
import { afterEach, describe, expect, it } from "vitest";
import { AgentSession, type AgentSessionEvent } from "../../src/core/agent-session.js";
import { AuthStorage } from "../../src/core/auth-storage.js";
import { convertToLlm } from "../../src/core/messages.js";
import { ModelRegistry } from "../../src/core/model-registry.js";
import { SessionManager } from "../../src/core/session-manager.js";
import { SettingsManager } from "../../src/core/settings-manager.js";
import { createTestResourceLoader } from "../utilities.js";

const LOCAL_UNSUPPORTED_DOCUMENT_ERROR =
	"This OpenAI-compatible user messages cannot accept first-class documents yet (evidence.pdf, application/pdf). Convert the file to PDF pages/images or extracted text before sending it to this model.";

interface LocalFailureHarness {
	session: AgentSession;
	faux: FauxProviderRegistration;
	events: AgentSessionEvent[];
	cleanup: () => void;
}

async function createLocalFailureHarness(): Promise<LocalFailureHarness> {
	const tempDir = join(tmpdir(), `pi-local-retry-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	const fauxProvider = registerFauxProvider();
	fauxProvider.setResponses([fauxAssistantMessage("recovered")]);
	const model = fauxProvider.getModel();
	const authStorage = AuthStorage.inMemory();
	authStorage.setRuntimeApiKey(model.provider, "faux-key");
	const modelRegistry = ModelRegistry.inMemory(authStorage);
	modelRegistry.registerProvider(model.provider, {
		baseUrl: model.baseUrl,
		apiKey: "faux-key",
		api: fauxProvider.api,
		models: fauxProvider.models.map((registeredModel) => ({
			id: registeredModel.id,
			name: registeredModel.name,
			api: registeredModel.api,
			reasoning: registeredModel.reasoning,
			input: registeredModel.input,
			cost: registeredModel.cost,
			contextWindow: registeredModel.contextWindow,
			maxTokens: registeredModel.maxTokens,
			baseUrl: registeredModel.baseUrl,
		})),
	});

	let convertAttempts = 0;
	const agent = new Agent({
		getApiKey: () => "faux-key",
		initialState: {
			model,
			systemPrompt: "You are a test assistant.",
			tools: [],
		},
		convertToLlm: async (messages) => {
			convertAttempts++;
			if (convertAttempts === 1) {
				throw new AttachmentSerializationError(LOCAL_UNSUPPORTED_DOCUMENT_ERROR, ["document"]);
			}
			return convertToLlm(messages);
		},
	});

	const session = new AgentSession({
		agent,
		sessionManager: SessionManager.inMemory(tempDir),
		settingsManager: SettingsManager.inMemory({ retry: { enabled: true, maxRetries: 2, baseDelayMs: 1 } }),
		cwd: tempDir,
		modelRegistry,
		resourceLoader: createTestResourceLoader(),
	});

	const events: AgentSessionEvent[] = [];
	session.subscribe((event) => {
		events.push(event);
	});

	return {
		session,
		faux: fauxProvider,
		events,
		cleanup() {
			session.dispose();
			fauxProvider.unregister();
			if (existsSync(tempDir)) {
				rmSync(tempDir, { recursive: true, force: true });
			}
		},
	};
}

describe("AgentSession attachment retry security", () => {
	const harnesses: LocalFailureHarness[] = [];

	afterEach(() => {
		while (harnesses.length > 0) {
			harnesses.pop()?.cleanup();
		}
	});

	it("retries after a local attachment serialization failure without trusting provider error text", async () => {
		const harness = await createLocalFailureHarness();
		harnesses.push(harness);

		await harness.session.prompt("review this", {
			attachments: [
				{
					type: "document",
					mimeType: "application/pdf",
					data: "ZmFrZQ==",
					fileName: "evidence.pdf",
				},
			],
		});

		const retryStarts = harness.events.filter(
			(event): event is Extract<AgentSessionEvent, { type: "auto_retry_start" }> =>
				event.type === "auto_retry_start",
		);
		const retryEnds = harness.events.filter(
			(event): event is Extract<AgentSessionEvent, { type: "auto_retry_end" }> => event.type === "auto_retry_end",
		);

		expect(harness.faux.state.callCount).toBe(1);
		expect(retryStarts.map((event) => event.errorMessage)).toEqual([
			`${LOCAL_UNSUPPORTED_DOCUMENT_ERROR} [auto-retry removed document attachments from the latest user attachment message]`,
		]);
		expect(retryEnds.map((event) => event.success)).toEqual([true]);
		const user = harness.session.messages.find((message) => message.role === "user");
		expect(user?.role).toBe("user");
		expect(typeof user?.content).not.toBe("string");
		expect(
			user?.role === "user" && typeof user.content !== "string"
				? user.content.some((part) => part.type === "document")
				: false,
		).toBe(false);
	});
});
