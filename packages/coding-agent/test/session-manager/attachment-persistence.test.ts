import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { convertToLlm } from "../../src/core/messages.js";
import { SessionManager } from "../../src/core/session-manager.js";

function createTempDir(): string {
	const tempDir = join(tmpdir(), `pi-session-attachments-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(tempDir, { recursive: true });
	return tempDir;
}

function assistantMessage(text: string) {
	return {
		role: "assistant" as const,
		content: [{ type: "text" as const, text }],
		api: "faux",
		provider: "faux",
		model: "faux-model",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop" as const,
		timestamp: Date.now(),
	};
}

describe("SessionManager attachment persistence", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		while (tempDirs.length > 0) {
			rmSync(tempDirs.pop()!, { recursive: true, force: true });
		}
	});

	it("omits attachment binary data from persisted session files and reloads placeholder text instead", () => {
		const tempDir = createTempDir();
		tempDirs.push(tempDir);

		const session = SessionManager.create(tempDir, tempDir);
		session.appendMessage({
			role: "user",
			content: [
				{ type: "text", text: "Review these files." },
				{ type: "image", mimeType: "image/png", data: "raw-image-bytes" },
				{
					type: "document",
					mimeType: "application/pdf",
					data: "raw-document-bytes",
					fileName: "evidence.pdf",
				},
			],
			timestamp: Date.now(),
		});
		session.appendMessage(assistantMessage("Acknowledged."));
		session.appendCustomMessageEntry(
			"tool_attachment",
			[
				{ type: "text", text: "Read attachment prepared for model inspection." },
				{
					type: "document",
					mimeType: "application/pdf",
					data: "tool-document-bytes",
					fileName: "tool.pdf",
				},
			],
			false,
			{ toolName: "read", toolCallId: "call-1" },
		);

		const sessionFile = session.getSessionFile();
		expect(sessionFile).toBeDefined();
		const persisted = readFileSync(sessionFile!, "utf-8");
		expect(persisted).not.toContain("raw-image-bytes");
		expect(persisted).not.toContain("raw-document-bytes");
		expect(persisted).not.toContain("tool-document-bytes");
		expect(persisted).toContain("[image binary omitted from persisted session (image/png)]");
		expect(persisted).toContain("[document binary omitted from persisted session: evidence.pdf (application/pdf)]");
		expect(persisted).toContain("[document binary omitted from persisted session: tool.pdf (application/pdf)]");

		const reloaded = SessionManager.open(sessionFile!, tempDir);
		const context = reloaded.buildSessionContext();
		expect(context.messages.map((message) => message.role)).toEqual(["user", "assistant", "custom"]);
		expect(context.messages[0]).toMatchObject({
			role: "user",
			content: [
				{ type: "text", text: "Review these files." },
				{ type: "text", text: "[image binary omitted from persisted session (image/png)]" },
				{ type: "text", text: "[document binary omitted from persisted session: evidence.pdf (application/pdf)]" },
			],
		});
		expect(context.messages[2]).toMatchObject({
			role: "custom",
			content: [
				{ type: "text", text: "Read attachment prepared for model inspection." },
				{ type: "text", text: "[document binary omitted from persisted session: tool.pdf (application/pdf)]" },
			],
		});

		const providerContext = convertToLlm(context.messages);
		const providerUserMessages = providerContext.filter((message) => message.role === "user");
		expect(providerUserMessages).toHaveLength(2);
		expect(providerUserMessages[1]).toMatchObject({
			role: "user",
			content: [
				{ type: "text", text: "Read attachment prepared for model inspection." },
				{ type: "text", text: "[document binary omitted from persisted session: tool.pdf (application/pdf)]" },
			],
		});
	});
});
