import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@mariozechner/pi-ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "../src/core/extensions/types.js";

vi.mock("../src/utils/pdf.js", () => ({
	getPDFPageCount: vi.fn(),
	parsePDFPageRange: vi.fn(),
	PDF_AT_MENTION_INLINE_THRESHOLD: 10,
	PDF_MAX_PAGES_PER_READ: 20,
	renderPdfPagesToImageBlocks: vi.fn(),
}));

vi.mock("../src/utils/image-resize.js", () => ({
	getImageDimensions: vi.fn(),
	clipImageCropRegion: vi.fn((region, width, height) => {
		const right = Math.min(width, region.left + region.width);
		const bottom = Math.min(height, region.top + region.height);
		if (right <= region.left || bottom <= region.top) {
			return null;
		}
		return {
			left: region.left,
			top: region.top,
			width: right - region.left,
			height: bottom - region.top,
		};
	}),
	formatDimensionNote: vi.fn(() => "[Image dimensions: 1200x800. Coordinates map directly to the original image.]"),
	resizeImage: vi.fn(),
}));

import { createReadToolDefinition } from "../src/core/tools/read.js";
import { getImageDimensions, resizeImage } from "../src/utils/image-resize.js";
import { getPDFPageCount, parsePDFPageRange, renderPdfPagesToImageBlocks } from "../src/utils/pdf.js";

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

	beforeEach(() => {
		testDir = join(tmpdir(), `pi-read-pdf-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });

		pdfPath = join(testDir, "sample.pdf");
		writeFileSync(pdfPath, "%PDF-1.4\nfake pdf body");

		vi.mocked(renderPdfPagesToImageBlocks).mockReset();
		vi.mocked(renderPdfPagesToImageBlocks).mockResolvedValue([]);
		vi.mocked(getPDFPageCount).mockResolvedValue(12);
		vi.mocked(parsePDFPageRange).mockImplementation((pages: string) => {
			if (pages === "2-3") {
				return { firstPage: 2, lastPage: 3 };
			}
			if (pages === "4") {
				return { firstPage: 4, lastPage: 4 };
			}
			return null;
		});
		vi.mocked(getImageDimensions).mockResolvedValue({ width: 1200, height: 800 });
		vi.mocked(resizeImage).mockReset();
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	it("auto-selects the first range for PDFs above the inline threshold", async () => {
		const pageImages = Array.from({ length: 10 }, (_, index) => ({
			type: "image" as const,
			mimeType: "image/jpeg",
			data: `resized-page-${index + 1}`,
		}));
		vi.mocked(renderPdfPagesToImageBlocks).mockResolvedValue(pageImages);

		const tool = createReadToolDefinition(testDir);
		const result = await tool.execute(
			"read-pdf-threshold",
			{ path: pdfPath },
			undefined,
			undefined,
			createExtensionContext(),
		);

		expect(result.content[0]).toEqual({
			type: "text",
			text:
				'Showing PDF pages 1-10 of 12. Auto-selected first range. Use pages="11-12" to continue.\n' +
				'[To inspect a smaller area, re-read one page with pages="N" and region={left,top,width,height}.]',
		});
		expect(renderPdfPagesToImageBlocks).toHaveBeenCalledWith(
			pdfPath,
			expect.objectContaining({
				firstPage: 1,
				lastPage: 10,
			}),
		);
		expect(result.details).toEqual({
			pdf: {
				pageCount: 12,
				renderedPages: 10,
				firstPage: 1,
				lastPage: 10,
				rangeSize: 10,
				previousRange: undefined,
				nextRange: "11-12",
			},
		});
	});

	it("uses visual PDF rendering even for document-capable models", async () => {
		const pageImages = Array.from({ length: 10 }, (_, index) => ({
			type: "image" as const,
			mimeType: "image/jpeg",
			data: `resized-page-${index + 1}`,
		}));
		vi.mocked(renderPdfPagesToImageBlocks).mockResolvedValue(pageImages);

		const tool = createReadToolDefinition(testDir);
		const result = await tool.execute(
			"read-pdf-document-capable",
			{ path: pdfPath },
			undefined,
			undefined,
			createExtensionContext(createModel(["text", "image", "document"])),
		);

		expect(result.content[0]).toEqual({
			type: "text",
			text:
				'Showing PDF pages 1-10 of 12. Auto-selected first range. Use pages="11-12" to continue.\n' +
				'[To inspect a smaller area, re-read one page with pages="N" and region={left,top,width,height}.]',
		});
		expect(result.content.filter((block) => block.type === "image")).toHaveLength(10);
		expect(result.details).toEqual({
			pdf: {
				pageCount: 12,
				renderedPages: 10,
				firstPage: 1,
				lastPage: 10,
				rangeSize: 10,
				previousRange: undefined,
				nextRange: "11-12",
			},
		});
		expect(renderPdfPagesToImageBlocks).toHaveBeenCalledWith(
			pdfPath,
			expect.objectContaining({
				firstPage: 1,
				lastPage: 10,
			}),
		);
	});

	it("renders requested PDF page ranges as image attachments", async () => {
		vi.mocked(renderPdfPagesToImageBlocks).mockResolvedValue([
			{
				type: "image",
				mimeType: "image/jpeg",
				data: "resized-cGFnZS0x",
			},
			{
				type: "image",
				mimeType: "image/jpeg",
				data: "resized-cGFnZS0y",
			},
		]);

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

		expect(textBlock).toEqual({
			type: "text",
			text:
				'Showing PDF pages 2-3 of 12. Use pages="4-5" to continue.\n' +
				'[To inspect a smaller area, re-read one page with pages="N" and region={left,top,width,height}.]',
		});
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
				rangeSize: 2,
				previousRange: "1",
				nextRange: "4-5",
			},
		});
	});

	it("reports partial PDF page omissions truthfully when only some requested pages can be prepared", async () => {
		vi.mocked(renderPdfPagesToImageBlocks).mockResolvedValue([
			{
				type: "image",
				mimeType: "image/jpeg",
				data: "resized-cGFnZS0x",
			},
		]);

		const tool = createReadToolDefinition(testDir);
		const result = await tool.execute(
			"read-pdf-pages-partial",
			{ path: pdfPath, pages: "2-3" },
			undefined,
			undefined,
			createExtensionContext(),
		);

		expect(result.content[0]).toEqual({
			type: "text",
			text:
				'Prepared 1 of 2 requested PDF pages 2-3 of 12. Use pages="4-5" to continue.\n' +
				'[To inspect a smaller area, re-read one page with pages="N" and region={left,top,width,height}.]\n' +
				"[Some requested PDF pages were omitted because they could not be resized below the inline image size limit.]",
		});
		expect(result.details).toEqual({
			pdf: {
				pageCount: 12,
				renderedPages: 1,
				firstPage: 2,
				lastPage: 3,
				rangeSize: 2,
				previousRange: "1",
				nextRange: "4-5",
			},
		});
	});

	it("forces single-page raster rendering for PDF region reads", async () => {
		vi.mocked(renderPdfPagesToImageBlocks).mockResolvedValue([
			{
				type: "image",
				mimeType: "image/jpeg",
				data: "raw-page-image",
			},
		]);
		vi.mocked(resizeImage).mockResolvedValue({
			data: "cropped-page-image",
			mimeType: "image/jpeg",
			originalWidth: 1200,
			originalHeight: 800,
			width: 300,
			height: 200,
			wasResized: true,
			crop: {
				left: 100,
				top: 120,
				width: 300,
				height: 200,
			},
		});

		const tool = createReadToolDefinition(testDir);
		const result = await tool.execute(
			"read-pdf-region",
			{ path: pdfPath, pages: "4", region: { left: 100, top: 120, width: 300, height: 200 } },
			undefined,
			undefined,
			createExtensionContext(createModel(["text", "image", "document"])),
		);

		expect(renderPdfPagesToImageBlocks).toHaveBeenCalledWith(
			pdfPath,
			expect.objectContaining({
				firstPage: 4,
				lastPage: 4,
				autoResize: false,
			}),
		);
		expect(resizeImage).toHaveBeenCalledWith(
			{ type: "image", mimeType: "image/jpeg", data: "raw-page-image" },
			{ crop: { left: 100, top: 120, width: 300, height: 200 } },
		);
		expect(result.content).toEqual([
			{
				type: "text",
				text:
					'Showing PDF page 4 of 12. Use pages="5" to continue.\n' +
					"[Image dimensions: 1200x800. Coordinates map directly to the original image.]\n" +
					'[To inspect a smaller area, re-read this page with pages="4" and region={left,top,width,height}.]',
			},
			{
				type: "image",
				mimeType: "image/jpeg",
				data: "cropped-page-image",
			},
		]);
		expect(result.details).toEqual({
			pdf: {
				pageCount: 12,
				renderedPages: 1,
				firstPage: 4,
				lastPage: 4,
				rangeSize: 1,
				previousRange: "3",
				nextRange: "5",
			},
		});
	});

	it("rejects PDF region reads that span multiple pages", async () => {
		const tool = createReadToolDefinition(testDir);

		await expect(
			tool.execute(
				"read-pdf-region-multi",
				{ path: pdfPath, pages: "2-3", region: { left: 0, top: 0, width: 100, height: 100 } },
				undefined,
				undefined,
				createExtensionContext(),
			),
		).rejects.toThrow(/exactly one page/i);
	});

	it("rejects PDF region reads when the crop misses the page bounds", async () => {
		vi.mocked(renderPdfPagesToImageBlocks).mockResolvedValue([
			{
				type: "image",
				mimeType: "image/jpeg",
				data: "raw-page-image",
			},
		]);

		const tool = createReadToolDefinition(testDir);

		await expect(
			tool.execute(
				"read-pdf-region-empty",
				{ path: pdfPath, pages: "4", region: { left: 5000, top: 5000, width: 50, height: 50 } },
				undefined,
				undefined,
				createExtensionContext(),
			),
		).rejects.toThrow(/does not overlap the image bounds/i);
	});
});
