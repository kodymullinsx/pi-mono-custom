import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportFromFile } from "../src/core/export-html/index.js";
import { SessionManager } from "../src/core/session-manager.js";

function createTempDir(): string {
	const tempDir = join(tmpdir(), `pi-export-roundtrip-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

describe("export HTML attachment round-trip", () => {
	const tempDirs: string[] = [];

	afterEach(() => {
		while (tempDirs.length > 0) {
			rmSync(tempDirs.pop()!, { recursive: true, force: true });
		}
	});

	it("exports reopened sessions with native attachment blocks restored from sidecars", async () => {
		const tempDir = createTempDir();
		tempDirs.push(tempDir);

		const imageData = Buffer.from("html-image-bytes").toString("base64");
		const documentData = Buffer.from("html-document-bytes").toString("base64");

		const session = SessionManager.create(tempDir, tempDir);
		session.appendMessage({
			role: "user",
			content: [
				{ type: "text", text: "Export these." },
				{ type: "image", mimeType: "image/png", data: imageData },
				{
					type: "document",
					mimeType: "application/pdf",
					data: documentData,
					fileName: "export.pdf",
				},
			],
			timestamp: Date.now(),
		});
		session.appendMessage(assistantMessage("Ready."));

		const sessionFile = session.getSessionFile();
		expect(sessionFile).toBeDefined();

		const outputPath = join(tempDir, "session.html");
		await exportFromFile(sessionFile!, outputPath);

		const html = readFileSync(outputPath, "utf-8");
		const match = html.match(/<script id="session-data" type="application\/json">([^<]+)<\/script>/);
		expect(match?.[1]).toBeTruthy();
		const payload = JSON.parse(Buffer.from(match![1], "base64").toString("utf-8")) as {
			entries: Array<{
				type: string;
				message?: {
					role: string;
					content: Array<{ type: string; text?: string; mimeType?: string; data?: string; fileName?: string }>;
				};
			}>;
			downloadEntries: Array<{
				type: string;
				message?: {
					role: string;
					content: Array<{ type: string; text?: string; data?: string; fileName?: string }>;
				};
			}>;
		};
		const userEntry = payload.entries.find((entry) => entry.type === "message" && entry.message?.role === "user");
		expect(userEntry?.message?.content).toEqual([
			{ type: "text", text: "Export these." },
			{ type: "image", mimeType: "image/png", data: imageData },
			{ type: "document", mimeType: "application/pdf", data: documentData, fileName: "export.pdf" },
		]);

		const downloadUserEntry = payload.downloadEntries.find(
			(entry) => entry.type === "message" && entry.message?.role === "user",
		);
		expect(downloadUserEntry?.message?.content).toEqual([
			{ type: "text", text: "Export these." },
			{ type: "text", text: "[image]" },
			{ type: "text", text: "[document: export.pdf]" },
		]);
	});
});
