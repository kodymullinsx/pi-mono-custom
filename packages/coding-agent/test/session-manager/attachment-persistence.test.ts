import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadEntriesFromFile, SessionManager } from "../../src/core/session-manager.ts";

const IMAGE_DATA = Buffer.from("image-bytes").toString("base64");
const DOCUMENT_DATA = Buffer.from("%PDF-1.7\npdf-bytes").toString("base64");

function appendAssistant(session: SessionManager): void {
	session.appendMessage({
		role: "assistant",
		content: [{ type: "text", text: "done" }],
		api: "anthropic-messages",
		provider: "anthropic",
		model: "test",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	});
}

describe("session attachment persistence", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `pi-session-attachments-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("stores prompt attachments in sidecars and hydrates them on load", () => {
		const session = SessionManager.create(tempDir, tempDir);
		session.appendMessage({
			role: "user",
			content: [
				{ type: "text", text: "inspect these" },
				{ type: "image", mimeType: "image/png", data: IMAGE_DATA },
				{ type: "document", mimeType: "application/pdf", data: DOCUMENT_DATA, fileName: "evidence.pdf" },
			],
			timestamp: Date.now(),
		});
		session.appendCustomMessageEntry(
			"tool_attachment",
			[
				{ type: "text", text: "read attachment" },
				{ type: "document", mimeType: "application/pdf", data: DOCUMENT_DATA, fileName: "tool.pdf" },
			],
			false,
		);
		appendAssistant(session);

		const sessionFile = session.getSessionFile();
		if (!sessionFile) throw new Error("Expected session file");
		const persisted = readFileSync(sessionFile, "utf-8");
		expect(persisted).toContain("[image]");
		expect(persisted).toContain("[document: evidence.pdf]");
		expect(persisted).toContain("[document: tool.pdf]");
		expect(persisted).not.toContain(IMAGE_DATA);
		expect(persisted).not.toContain(DOCUMENT_DATA);

		const sidecarDir = sessionFile.replace(/\.jsonl$/i, ".attachments");
		expect(existsSync(sidecarDir)).toBe(true);
		expect(readdirSync(sidecarDir)).toHaveLength(3);

		const rawEntries = loadEntriesFromFile(sessionFile);
		const rawUser = rawEntries.find((entry) => entry.type === "message" && entry.message.role === "user");
		expect(JSON.stringify(rawUser)).toContain("_piAttachmentRef");

		const reopened = SessionManager.open(sessionFile, tempDir);
		const context = reopened.buildSessionContext();
		const user = context.messages.find((message) => message.role === "user");
		expect(user?.content).toEqual([
			{ type: "text", text: "inspect these" },
			{ type: "image", mimeType: "image/png", data: IMAGE_DATA },
			{ type: "document", mimeType: "application/pdf", data: DOCUMENT_DATA, fileName: "evidence.pdf" },
		]);
		const custom = context.messages.find((message) => message.role === "custom");
		expect(custom?.content).toEqual([
			{ type: "text", text: "read attachment" },
			{ type: "document", mimeType: "application/pdf", data: DOCUMENT_DATA, fileName: "tool.pdf" },
		]);
	});
});
