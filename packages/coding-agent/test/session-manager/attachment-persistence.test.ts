import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
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

const USER_IMAGE_DATA = Buffer.from("raw-image-bytes").toString("base64");
const USER_DOCUMENT_DATA = Buffer.from("raw-document-bytes").toString("base64");
const TOOL_DOCUMENT_DATA = Buffer.from("tool-document-bytes").toString("base64");
const FORK_IMAGE_DATA = Buffer.from("fork-image-bytes").toString("base64");

describe("SessionManager attachment persistence", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		while (tempDirs.length > 0) {
			rmSync(tempDirs.pop()!, { recursive: true, force: true });
		}
	});

	it("keeps attachment binary data out of JSONL while restoring native attachments on reload", () => {
		const tempDir = createTempDir();
		tempDirs.push(tempDir);

		const session = SessionManager.create(tempDir, tempDir);
		session.appendMessage({
			role: "user",
			content: [
				{ type: "text", text: "Review these files." },
				{ type: "image", mimeType: "image/png", data: USER_IMAGE_DATA },
				{
					type: "document",
					mimeType: "application/pdf",
					data: USER_DOCUMENT_DATA,
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
					data: TOOL_DOCUMENT_DATA,
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
		expect(persisted).toContain("[image]");
		expect(persisted).toContain("[document: evidence.pdf]");
		expect(persisted).toContain("[document: tool.pdf]");
		expect(persisted).toContain("_piAttachmentRef");

		const attachmentDir = sessionFile!.replace(/\.jsonl$/i, ".attachments");
		expect(existsSync(attachmentDir)).toBe(true);
		expect(readdirSync(attachmentDir)).toHaveLength(3);

		const reloaded = SessionManager.open(sessionFile!, tempDir);
		const context = reloaded.buildSessionContext();
		expect(context.messages.map((message) => message.role)).toEqual(["user", "assistant", "custom"]);
		expect(context.messages[0]).toMatchObject({
			role: "user",
			content: [
				{ type: "text", text: "Review these files." },
				{ type: "image", mimeType: "image/png", data: USER_IMAGE_DATA },
				{
					type: "document",
					mimeType: "application/pdf",
					data: USER_DOCUMENT_DATA,
					fileName: "evidence.pdf",
				},
			],
		});
		expect(context.messages[2]).toMatchObject({
			role: "custom",
			content: [
				{ type: "text", text: "Read attachment prepared for model inspection." },
				{
					type: "document",
					mimeType: "application/pdf",
					data: TOOL_DOCUMENT_DATA,
					fileName: "tool.pdf",
				},
			],
		});

		const providerContext = convertToLlm(context.messages);
		const providerUserMessages = providerContext.filter((message) => message.role === "user");
		expect(providerUserMessages).toHaveLength(2);
		expect(providerUserMessages[1]).toMatchObject({
			role: "user",
			content: [
				{ type: "text", text: "Read attachment prepared for model inspection." },
				{
					type: "document",
					mimeType: "application/pdf",
					data: TOOL_DOCUMENT_DATA,
					fileName: "tool.pdf",
				},
			],
		});
	});

	it("surfaces a missing attachment sidecar as an explicit text block on reload", () => {
		const tempDir = createTempDir();
		tempDirs.push(tempDir);

		const session = SessionManager.create(tempDir, tempDir);
		session.appendMessage({
			role: "user",
			content: [
				{ type: "text", text: "Inspect this image." },
				{ type: "image", mimeType: "image/png", data: USER_IMAGE_DATA },
			],
			timestamp: Date.now(),
		});
		session.appendMessage(assistantMessage("Done."));

		const sessionFile = session.getSessionFile();
		expect(sessionFile).toBeDefined();
		const attachmentDir = sessionFile!.replace(/\.jsonl$/i, ".attachments");
		const [sidecarFile] = readdirSync(attachmentDir);
		expect(sidecarFile).toBeDefined();
		rmSync(join(attachmentDir, sidecarFile!));

		const reloaded = SessionManager.open(sessionFile!, tempDir);
		const context = reloaded.buildSessionContext();
		const userMessage = context.messages[0] as { role: "user"; content: Array<{ type: string; text?: string }> };
		expect(userMessage).toMatchObject({
			role: "user",
			content: [{ type: "text", text: "Inspect this image." }, { type: "text" }],
		});
		const missingAttachmentBlock = userMessage.content[1] as { type: "text"; text: string };
		expect(missingAttachmentBlock.text).toContain("image attachment missing");
		expect(missingAttachmentBlock.text).toContain("expected sidecar file");
	});

	it("re-persists hydrated attachments when forking a session", () => {
		const sourceDir = createTempDir();
		const forkDir = createTempDir();
		tempDirs.push(sourceDir, forkDir);

		const source = SessionManager.create(sourceDir, sourceDir);
		source.appendMessage({
			role: "user",
			content: [
				{ type: "text", text: "Inspect this artifact." },
				{ type: "image", mimeType: "image/png", data: FORK_IMAGE_DATA },
			],
			timestamp: Date.now(),
		});
		source.appendMessage(assistantMessage("Done."));

		const sourceFile = source.getSessionFile();
		expect(sourceFile).toBeDefined();

		const forked = SessionManager.forkFrom(sourceFile!, forkDir, forkDir);
		const forkContext = forked.buildSessionContext();
		expect(forkContext.messages[0]).toMatchObject({
			role: "user",
			content: [
				{ type: "text", text: "Inspect this artifact." },
				{ type: "image", mimeType: "image/png", data: FORK_IMAGE_DATA },
			],
		});

		const forkFile = forked.getSessionFile();
		expect(forkFile).toBeDefined();
		const forkPersisted = readFileSync(forkFile!, "utf-8");
		expect(forkPersisted).not.toContain(FORK_IMAGE_DATA);
		expect(forkPersisted).toContain("_piAttachmentRef");
		expect(existsSync(forkFile!.replace(/\.jsonl$/i, ".attachments"))).toBe(true);
	});
});
