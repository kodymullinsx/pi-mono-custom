import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@mariozechner/pi-ai";
import { afterEach, describe, expect, test, vi } from "vitest";

const pdfMocks = vi.hoisted(() => ({
	getPDFPageCount: vi.fn(),
	readPDF: vi.fn(),
	renderPdfPagesToImageBlocks: vi.fn(),
}));

vi.mock("../src/utils/pdf.js", () => ({
	PDF_AT_MENTION_INLINE_THRESHOLD: 10,
	getPDFPageCount: pdfMocks.getPDFPageCount,
	readPDF: pdfMocks.readPDF,
	renderPdfPagesToImageBlocks: pdfMocks.renderPdfPagesToImageBlocks,
}));

import { processFileArguments } from "../src/cli/file-processor.js";

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

	test("renders small PDFs to image attachments for image-capable models without document input", async () => {
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
		expect(result.text).toContain("[PDF pages 1-1 attached as images from small.pdf]");
		expect(pdfMocks.readPDF).not.toHaveBeenCalled();
	});

	test("keeps small PDFs as first-class documents for document-capable models", async () => {
		const pdfPath = join(tempRoot, "native.pdf");
		writeFileSync(pdfPath, "%PDF-1.7");

		pdfMocks.getPDFPageCount.mockResolvedValue(2);
		pdfMocks.readPDF.mockResolvedValue({
			success: true,
			data: {
				type: "pdf",
				file: {
					filePath: pdfPath,
					base64: Buffer.from("native-pdf").toString("base64"),
					originalSize: 10,
					pageCount: 2,
				},
			},
		});

		const result = await processFileArguments([pdfPath], {
			model: createModel(["text", "image", "document"]),
		});

		expect(result.attachments).toEqual([
			{
				type: "document",
				mimeType: "application/pdf",
				data: Buffer.from("native-pdf").toString("base64"),
				fileName: "native.pdf",
			},
		]);
		expect(result.text).toContain("[PDF attached: native.pdf, 2 page(s)]");
	});

	test("references large PDFs instead of attaching them inline", async () => {
		const pdfPath = join(tempRoot, "large.pdf");
		writeFileSync(pdfPath, "%PDF-1.7");

		pdfMocks.getPDFPageCount.mockResolvedValue(18);

		const result = await processFileArguments([pdfPath], {
			model: createModel(["text", "image"]),
		});

		expect(result.attachments).toEqual([]);
		expect(result.text).toContain("[PDF referenced only: large.pdf has 18 page(s).");
		expect(result.text).toContain('pages="1-5"');
		expect(pdfMocks.renderPdfPagesToImageBlocks).not.toHaveBeenCalled();
		expect(pdfMocks.readPDF).not.toHaveBeenCalled();
	});

	test("keeps large PDFs as first-class documents for document-capable models", async () => {
		const pdfPath = join(tempRoot, "large-native.pdf");
		writeFileSync(pdfPath, "%PDF-1.7");

		pdfMocks.getPDFPageCount.mockResolvedValue(18);
		pdfMocks.readPDF.mockResolvedValue({
			success: true,
			data: {
				type: "pdf",
				file: {
					filePath: pdfPath,
					base64: Buffer.from("large-native-pdf").toString("base64"),
					originalSize: 10,
					pageCount: 18,
				},
			},
		});

		const result = await processFileArguments([pdfPath], {
			model: createModel(["text", "image", "document"]),
		});

		expect(result.attachments).toEqual([
			{
				type: "document",
				mimeType: "application/pdf",
				data: Buffer.from("large-native-pdf").toString("base64"),
				fileName: "large-native.pdf",
			},
		]);
		expect(result.text).toContain("[PDF attached: large-native.pdf, 18 page(s)]");
		expect(pdfMocks.renderPdfPagesToImageBlocks).not.toHaveBeenCalled();
	});

	test("preserves native PDF attachment failures when falling back to images", async () => {
		const pdfPath = join(tempRoot, "fallback.pdf");
		writeFileSync(pdfPath, "%PDF-1.7");

		pdfMocks.getPDFPageCount.mockResolvedValue(1);
		pdfMocks.readPDF.mockResolvedValue({
			success: false,
			error: { message: "Corrupted PDF", category: "corrupted" },
		});
		pdfMocks.renderPdfPagesToImageBlocks.mockResolvedValue([
			{
				type: "image",
				data: Buffer.from("fallback-image").toString("base64"),
				mimeType: "image/jpeg",
			},
		]);

		const result = await processFileArguments([pdfPath], {
			autoResizeImages: true,
			model: createModel(["text", "image", "document"]),
		});

		expect(result.attachments).toHaveLength(1);
		expect(result.attachments[0]).toMatchObject({
			type: "image",
			mimeType: "image/jpeg",
		});
		expect(result.text).toContain("First-class PDF attachment failed: Corrupted PDF.");
		expect(result.text).toContain(
			"[First-class PDF attachment failed: Corrupted PDF. PDF pages 1-1 attached as images from fallback.pdf]",
		);
	});
});
