import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportSessionToHtml } from "../src/core/export-html/index.ts";
import { SessionManager } from "../src/core/session-manager.ts";

function extractSessionData(html: string): unknown {
	const match = html.match(/<script id="session-data" type="application\/json">([^<]+)<\/script>/);
	if (!match) {
		throw new Error("session data script tag not found");
	}
	return JSON.parse(Buffer.from(match[1]!, "base64").toString("utf-8"));
}

describe("export HTML attachments", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		while (tempDirs.length > 0) {
			rmSync(tempDirs.pop()!, { recursive: true, force: true });
		}
	});

	it("omits raw attachment bytes from embedded and downloaded session data", async () => {
		const tempDir = join(tmpdir(), `pi-export-attachments-${Date.now()}`);
		tempDirs.push(tempDir);
		mkdirSync(tempDir, { recursive: true });
		const sessionManager = SessionManager.create(tempDir, tempDir);
		const rawDocumentData = Buffer.from("%PDF-1.7\nsecret export bytes").toString("base64");
		sessionManager.appendMessage({
			role: "user",
			content: [
				{ type: "text", text: "review" },
				{
					type: "document",
					mimeType: "application/pdf",
					fileName: "secret.pdf",
					data: rawDocumentData,
				},
			],
			timestamp: Date.now(),
		});
		sessionManager.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: "ok" }],
			api: "faux",
			provider: "faux",
			model: "faux",
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "stop",
			timestamp: Date.now(),
		});

		const outputPath = join(tempDir, "session.html");
		await exportSessionToHtml(sessionManager, undefined, outputPath);
		const html = readFileSync(outputPath, "utf-8");
		const sessionData = extractSessionData(html);

		expect(html).not.toContain(rawDocumentData);
		expect(JSON.stringify(sessionData)).not.toContain(rawDocumentData);
		expect(JSON.stringify(sessionData)).toContain("document attachment omitted from export: secret.pdf");
		expect(JSON.stringify(sessionData)).toContain("downloadEntries");
	});
});
