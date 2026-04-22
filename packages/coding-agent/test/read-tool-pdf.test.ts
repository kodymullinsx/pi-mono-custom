import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@mariozechner/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "../src/core/extensions/types.js";

vi.mock("../src/utils/image-resize.js", () => ({
	resizeImage: vi.fn(),
	formatDimensionNote: vi.fn(() => undefined),
}));

vi.mock("../src/utils/pdf-cache.js", () => ({
	getPDFCacheEntry: vi.fn(),
}));

vi.mock("../src/utils/pdf.js", () => ({
	extractPDFPages: vi.fn(),
	getPDFPageCount: vi.fn(),
	parsePDFPageRange: vi.fn(),
	PDF_AT_MENTION_INLINE_THRESHOLD: 10,
	PDF_MAX_PAGES_PER_READ: 20,
	readPDF: vi.fn(),
}));

import { createReadToolDefinition } from "../src/core/tools/read.js";
import { resizeImage } from "../src/utils/image-resize.js";
import { extractPDFPages, getPDFPageCount, parsePDFPageRange, readPDF } from "../src/utils/pdf.js";
import { getPDFCacheEntry } from "../src/utils/pdf-cache.js";

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

function createExtensionContext(model?: Model<any>): ExtensionContext {
	return {
		ui: {} as never,
		hasUI: false,
		cwd: "",
		sessionManager: {} as never,
		modelRegistry: {} as never,
		model,
		isIdle: () => true,
		signal: undefined,
		abort: () => {},
		hasPendingMessages: () => false,
		shutdown: () => {},
		getContextUsage: () => undefined,
		compact: () => {},
		getSystemPrompt: () => "",
	};
}

describe("read tool PDF support", () => {
	let testDir: string;
	let pdfPath: string;
	let renderedPagesDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `pi-read-pdf-${Date.now()}`);
		renderedPagesDir = join(testDir, "rendered-pages");
		mkdirSync(renderedPagesDir, { recursive: true });

		pdfPath = join(testDir, "sample.pdf");
		writeFileSync(pdfPath, "%PDF-1.4\nfake pdf body");

		vi.mocked(getPDFPageCount).mockResolvedValue(12);
		vi.mocked(getPDFCacheEntry).mockResolvedValue({
			outputDir: renderedPagesDir,
			imagePaths: [],
		});
		vi.mocked(parsePDFPageRange).mockImplementation((pages: string) => {
			if (pages === "2-3") {
				return { firstPage: 2, lastPage: 3 };
			}
			return null;
		});
		vi.mocked(resizeImage).mockImplementation(async ({ data, mimeType }) => ({
			data: `resized-${data}`,
			mimeType,
			originalWidth: 100,
			originalHeight: 100,
			width: 100,
			height: 100,
			wasResized: false,
		}));
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it("requires pages for PDFs above the inline threshold", async () => {
		const tool = createReadToolDefinition(testDir);

		await expect(
			tool.execute("read-pdf-threshold", { path: pdfPath }, undefined, undefined, createExtensionContext()),
		).rejects.toThrow(/too many to read at once/i);
	});

	it("keeps large PDFs as first-class documents for document-capable models", async () => {
		vi.mocked(readPDF).mockResolvedValue({
			success: true,
			data: {
				type: "pdf",
				file: {
					filePath: pdfPath,
					base64: Buffer.from("native-pdf").toString("base64"),
					originalSize: 1234,
					pageCount: 12,
				},
			},
		});

		const tool = createReadToolDefinition(testDir);
		const result = await tool.execute(
			"read-pdf-native",
			{ path: pdfPath },
			undefined,
			undefined,
			createExtensionContext(createModel(["text", "image", "document"])),
		);

		expect(result.content).toEqual([
			{ type: "text", text: "Read PDF file [application/pdf] (12 page(s))" },
			{
				type: "document",
				mimeType: "application/pdf",
				data: Buffer.from("native-pdf").toString("base64"),
				fileName: "sample.pdf",
			},
		]);
		expect(result.details).toEqual({
			pdf: {
				pageCount: 12,
			},
		});
		expect(extractPDFPages).not.toHaveBeenCalled();
	});

	it("renders requested PDF page ranges as image attachments", async () => {
		const pageOne = join(renderedPagesDir, "page-1.jpg");
		const pageTwo = join(renderedPagesDir, "page-2.jpg");
		writeFileSync(pageOne, "page-1");
		writeFileSync(pageTwo, "page-2");

		vi.mocked(extractPDFPages).mockResolvedValue({
			success: true,
			data: {
				type: "parts",
				file: {
					filePath: pdfPath,
					originalSize: 1234,
					count: 2,
					outputDir: renderedPagesDir,
					imagePaths: [pageOne, pageTwo],
					firstPage: 2,
					lastPage: 3,
				},
			},
		});

		const tool = createReadToolDefinition(testDir);
		const result = await tool.execute(
			"read-pdf-pages",
			{ path: pdfPath, pages: "2-3" },
			undefined,
			undefined,
			createExtensionContext(),
		);

		const textBlock = result.content.find((block) => block.type === "text");
		const imageBlocks = result.content.filter((block) => block.type === "image");

		expect(textBlock).toEqual({ type: "text", text: "Read PDF pages 2-3" });
		expect(imageBlocks).toHaveLength(2);
		expect(imageBlocks[0]).toMatchObject({
			type: "image",
			mimeType: "image/jpeg",
			data: "resized-cGFnZS0x",
		});
		expect(imageBlocks[1]).toMatchObject({
			type: "image",
			mimeType: "image/jpeg",
			data: "resized-cGFnZS0y",
		});
		expect(result.details).toEqual({
			pdf: {
				pageCount: 12,
				renderedPages: 2,
				firstPage: 2,
				lastPage: 3,
			},
		});
	});
});
