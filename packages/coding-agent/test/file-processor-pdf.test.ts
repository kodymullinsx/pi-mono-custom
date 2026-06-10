import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import { afterEach, describe, expect, test, vi } from "vitest";

const pdfMocks = vi.hoisted(() => ({
	getPDFPageCount: vi.fn(),
	renderPdfPagesToImageBlocks: vi.fn(),
}));

vi.mock("../src/utils/pdf.js", () => ({
	PDF_AT_MENTION_INLINE_THRESHOLD: 10,
	getPDFPageCount: pdfMocks.getPDFPageCount,
	renderPdfPagesToImageBlocks: pdfMocks.renderPdfPagesToImageBlocks,
}));

import { processFileArguments } from "../src/cli/file-processor.ts";

function createModel(input: Model<any>["input"]): Model<any> {
	return {
		id: "test-model",
		name: "test-model",
		provider: "openai",
		api: "openai-responses",
		baseUrl: "https://api.example.com",
		reasoning: false,
		input,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16000,
	};
}

describe("processFileArguments PDF handling", () => {
	const tempRoot = mkdtempSync(join(tmpdir(), "pi-file-processor-test-"));

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("renders small PDFs to image attachments for image-capable models", async () => {
		const pdfPath = join(tempRoot, "small.pdf");
		writeFileSync(pdfPath, "%PDF-1.7");

		pdfMocks.getPDFPageCount.mockResolvedValue(1);
		pdfMocks.renderPdfPagesToImageBlocks.mockResolvedValue([
			{
				type: "image",
				data: Buffer.from("resized-image").toString("base64"),
				mimeType: "image/jpeg",
			},
		]);

		const result = await processFileArguments([pdfPath], {
			autoResizeImages: true,
			model: createModel(["text", "image"]),
		});

		expect(result.attachments).toHaveLength(1);
		expect(result.attachments[0]).toMatchObject({
			type: "image",
			mimeType: "image/jpeg",
		});
		expect(result.text).toContain("[PDF pages 1 attached as images from small.pdf.]");
	});

	test("auto-attaches the first range for large PDFs", async () => {
		const pdfPath = join(tempRoot, "large.pdf");
		writeFileSync(pdfPath, "%PDF-1.7");

		pdfMocks.getPDFPageCount.mockResolvedValue(18);
		pdfMocks.renderPdfPagesToImageBlocks.mockResolvedValue(
			Array.from({ length: 10 }, (_, index) => ({
				type: "image",
				data: Buffer.from(`page-${index + 1}`).toString("base64"),
				mimeType: "image/jpeg",
			})),
		);

		const result = await processFileArguments([pdfPath], {
			model: createModel(["text", "image"]),
		});

		expect(result.attachments).toHaveLength(10);
		expect(result.text).toContain(
			"[PDF pages 1-10 of 18 attached as images from large.pdf. Auto-attached first range.",
		);
		expect(result.text).toContain('Use the read tool with pages="11-18" to continue.');
	});

	test("keeps reference-only text when the model has no image input", async () => {
		const pdfPath = join(tempRoot, "no-image.pdf");
		writeFileSync(pdfPath, "%PDF-1.7");

		pdfMocks.getPDFPageCount.mockResolvedValue(12);

		const result = await processFileArguments([pdfPath], {
			model: createModel(["text"]),
		});

		expect(result.attachments).toEqual([]);
		expect(result.text).toContain("[PDF referenced only: no-image.pdf has 12 page(s).");
		expect(result.text).toContain("The current model does not support inline PDF rendering in this path.");
		expect(pdfMocks.renderPdfPagesToImageBlocks).not.toHaveBeenCalled();
	});
});
