import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pdfMocks = vi.hoisted(() => ({
	execCommand: vi.fn(),
	getPDFCacheEntry: vi.fn(),
	resizeImage: vi.fn(),
}));

vi.mock("../src/core/exec.js", () => ({
	execCommand: pdfMocks.execCommand,
}));

vi.mock("../src/utils/image-resize.js", () => ({
	resizeImage: pdfMocks.resizeImage,
}));

vi.mock("../src/utils/pdf-cache.js", () => ({
	getPDFCacheEntry: pdfMocks.getPDFCacheEntry,
	sortPDFPageImageEntries: (entries: string[]) =>
		[...entries].sort((a, b) => {
			const pageA = /-(\d+)\.jpg$/i.exec(a)?.[1];
			const pageB = /-(\d+)\.jpg$/i.exec(b)?.[1];
			if (pageA !== undefined && pageB !== undefined && pageA !== pageB) {
				return Number.parseInt(pageA, 10) - Number.parseInt(pageB, 10);
			}
			if (pageA !== undefined && pageB === undefined) {
				return -1;
			}
			if (pageA === undefined && pageB !== undefined) {
				return 1;
			}
			return a.localeCompare(b);
		}),
}));

import { extractPDFPages, parsePDFPageRange, renderPdfPagesToImageBlocks } from "../src/utils/pdf.js";

describe("PDF utility behavior", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "pi-pdf-utils-"));
		pdfMocks.execCommand.mockReset();
		pdfMocks.getPDFCacheEntry.mockReset();
		pdfMocks.resizeImage.mockReset();
		pdfMocks.resizeImage.mockImplementation(async (image: any) => image);
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	function writePdf(name = "input.pdf"): string {
		const pdfPath = join(tempDir, name);
		writeFileSync(pdfPath, "%PDF-1.7\n");
		return pdfPath;
	}

	function mockPdftoppmPages(pages: number[]): void {
		pdfMocks.execCommand.mockImplementation(async (_command: string, args: string[]) => {
			if (args.includes("-v")) {
				return { code: 0, stdout: "", stderr: "pdftoppm version" };
			}

			const prefix = args[args.length - 1];
			mkdirSync(dirname(prefix), { recursive: true });
			for (const page of pages) {
				writeFileSync(`${prefix}-${page}.jpg`, `page-${page}`);
			}
			return { code: 0, stdout: "", stderr: "" };
		});
	}

	it("rejects malformed page ranges instead of partially parsing them", () => {
		expect(parsePDFPageRange("1abc")).toBeNull();
		expect(parsePDFPageRange("1-3junk")).toBeNull();
		expect(parsePDFPageRange("1--3")).toBeNull();
		expect(parsePDFPageRange("1-3")).toEqual({ firstPage: 1, lastPage: 3 });
		expect(parsePDFPageRange("4-")).toEqual({ firstPage: 4, lastPage: Number.POSITIVE_INFINITY });
	});

	it("sorts extracted page images numerically", async () => {
		const pdfPath = writePdf();
		mockPdftoppmPages([10, 2, 1]);

		const result = await extractPDFPages(pdfPath, { outputDir: join(tempDir, "pages") });

		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.file.imagePaths.map((path) => basename(path))).toEqual([
				"page-1.jpg",
				"page-2.jpg",
				"page-10.jpg",
			]);
		}
	});

	it("rerenders bounded cached ranges when the cached image count is incomplete", async () => {
		const pdfPath = writePdf();
		const outputDir = join(tempDir, "cache");
		mkdirSync(outputDir, { recursive: true });
		const stalePage = join(outputDir, "page-1.jpg");
		writeFileSync(stalePage, "stale page");
		mockPdftoppmPages([1, 2]);
		pdfMocks.getPDFCacheEntry.mockResolvedValue({
			outputDir,
			imagePaths: [stalePage],
		});

		const blocks = await renderPdfPagesToImageBlocks(pdfPath, {
			firstPage: 1,
			lastPage: 2,
			pageCount: 2,
			autoResize: true,
		});

		expect(blocks).toHaveLength(2);
		expect(Buffer.from(blocks[0]!.data, "base64").toString("utf-8")).toBe("page-1");
		expect(Buffer.from(blocks[1]!.data, "base64").toString("utf-8")).toBe("page-2");
	});

	it("keeps complete short caches when the requested range extends beyond the PDF page count", async () => {
		const pdfPath = writePdf();
		const outputDir = join(tempDir, "short-cache");
		mkdirSync(outputDir, { recursive: true });
		const cachedPaths = [1, 2, 3].map((page) => {
			const imagePath = join(outputDir, `page-${page}.jpg`);
			writeFileSync(imagePath, `cached-page-${page}`);
			return imagePath;
		});
		pdfMocks.getPDFCacheEntry.mockResolvedValue({
			outputDir,
			imagePaths: cachedPaths,
		});

		const blocks = await renderPdfPagesToImageBlocks(pdfPath, {
			firstPage: 1,
			lastPage: 10,
			pageCount: 3,
			autoResize: true,
		});

		expect(pdfMocks.execCommand).not.toHaveBeenCalled();
		expect(blocks).toHaveLength(3);
		expect(Buffer.from(blocks[2]!.data, "base64").toString("utf-8")).toBe("cached-page-3");
	});

	it("sorts complete cached page images numerically", async () => {
		const pdfPath = writePdf();
		const outputDir = join(tempDir, "ordered-cache");
		mkdirSync(outputDir, { recursive: true });
		const cachedPaths = [1, 10, 2, 3, 4, 5, 6, 7, 8, 9].map((page) => {
			const imagePath = join(outputDir, `page-${page}.jpg`);
			writeFileSync(imagePath, `cached-page-${page}`);
			return imagePath;
		});
		pdfMocks.getPDFCacheEntry.mockResolvedValue({
			outputDir,
			imagePaths: cachedPaths,
		});

		const blocks = await renderPdfPagesToImageBlocks(pdfPath, {
			firstPage: 1,
			lastPage: 10,
			pageCount: 10,
			autoResize: true,
		});

		expect(pdfMocks.execCommand).not.toHaveBeenCalled();
		expect(blocks).toHaveLength(10);
		expect(Buffer.from(blocks[0]!.data, "base64").toString("utf-8")).toBe("cached-page-1");
		expect(Buffer.from(blocks[1]!.data, "base64").toString("utf-8")).toBe("cached-page-2");
		expect(Buffer.from(blocks[9]!.data, "base64").toString("utf-8")).toBe("cached-page-10");
	});
});
