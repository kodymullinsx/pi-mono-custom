import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ImageContent } from "@mariozechner/pi-ai";
import { execCommand } from "../core/exec.js";
import { resizeImage } from "./image-resize.js";
import { getPDFCacheEntry } from "./pdf-cache.js";

export const PDF_TARGET_RAW_SIZE = 20 * 1024 * 1024;
export const PDF_EXTRACT_SIZE_THRESHOLD = 3 * 1024 * 1024;
export const PDF_MAX_EXTRACT_SIZE = 100 * 1024 * 1024;
export const PDF_MAX_PAGES_PER_READ = 20;
export const PDF_AT_MENTION_INLINE_THRESHOLD = 10;

export type PDFErrorReason = "empty" | "too_large" | "password_protected" | "corrupted" | "unknown" | "unavailable";

export interface PDFError {
	reason: PDFErrorReason;
	message: string;
}

export type PDFResult<T> = { success: true; data: T } | { success: false; error: PDFError };

export interface PDFReadData {
	type: "pdf";
	file: {
		filePath: string;
		base64: string;
		originalSize: number;
		pageCount: number | null;
	};
}

export interface PDFExtractPagesData {
	type: "parts";
	file: {
		filePath: string;
		originalSize: number;
		count: number;
		outputDir: string;
		imagePaths: string[];
		firstPage: number;
		lastPage: number;
	};
}

let pdfinfoAvailable: boolean | undefined;
let pdftoppmAvailable: boolean | undefined;

export function parsePDFPageRange(pages: string): { firstPage: number; lastPage: number } | null {
	const trimmed = pages.trim();
	if (!trimmed) {
		return null;
	}

	if (trimmed.endsWith("-")) {
		const first = Number.parseInt(trimmed.slice(0, -1), 10);
		if (Number.isNaN(first) || first < 1) {
			return null;
		}
		return { firstPage: first, lastPage: Number.POSITIVE_INFINITY };
	}

	const dashIndex = trimmed.indexOf("-");
	if (dashIndex === -1) {
		const page = Number.parseInt(trimmed, 10);
		if (Number.isNaN(page) || page < 1) {
			return null;
		}
		return { firstPage: page, lastPage: page };
	}

	const first = Number.parseInt(trimmed.slice(0, dashIndex), 10);
	const last = Number.parseInt(trimmed.slice(dashIndex + 1), 10);
	if (Number.isNaN(first) || Number.isNaN(last) || first < 1 || last < first) {
		return null;
	}

	return { firstPage: first, lastPage: last };
}

async function checkBinaryAvailable(command: string, args: string[]): Promise<boolean> {
	const result = await execCommand(command, args, tmpdir(), { timeout: 5000 });
	return result.code === 0 || result.stderr.length > 0;
}

export async function isPdfinfoAvailable(): Promise<boolean> {
	if (pdfinfoAvailable !== undefined) {
		return pdfinfoAvailable;
	}
	pdfinfoAvailable = await checkBinaryAvailable("pdfinfo", ["-v"]);
	return pdfinfoAvailable;
}

export async function isPdftoppmAvailable(): Promise<boolean> {
	if (pdftoppmAvailable !== undefined) {
		return pdftoppmAvailable;
	}
	pdftoppmAvailable = await checkBinaryAvailable("pdftoppm", ["-v"]);
	return pdftoppmAvailable;
}

export async function getPDFPageCount(filePath: string, signal?: AbortSignal): Promise<number | null> {
	if (!(await isPdfinfoAvailable())) {
		return null;
	}

	const result = await execCommand("pdfinfo", [filePath], dirname(filePath), {
		signal,
		timeout: 10_000,
	});
	if (result.code !== 0) {
		return null;
	}

	const match = /^Pages:\s+(\d+)/m.exec(result.stdout);
	if (!match) {
		return null;
	}

	const count = Number.parseInt(match[1], 10);
	return Number.isNaN(count) ? null : count;
}

export async function readPDF(
	filePath: string,
	options?: {
		pageCount?: number | null;
	},
): Promise<PDFResult<PDFReadData>> {
	try {
		const fileStats = await stat(filePath);
		if (fileStats.size === 0) {
			return {
				success: false,
				error: { reason: "empty", message: `PDF file is empty: ${filePath}` },
			};
		}

		if (fileStats.size > PDF_TARGET_RAW_SIZE) {
			return {
				success: false,
				error: {
					reason: "too_large",
					message: `PDF file exceeds maximum allowed size of ${PDF_TARGET_RAW_SIZE} bytes.`,
				},
			};
		}

		const fileBuffer = await readFile(filePath);
		const header = fileBuffer.subarray(0, 5).toString("ascii");
		if (!header.startsWith("%PDF-")) {
			return {
				success: false,
				error: {
					reason: "corrupted",
					message: `File is not a valid PDF (missing %PDF- header): ${filePath}`,
				},
			};
		}

		return {
			success: true,
			data: {
				type: "pdf",
				file: {
					filePath,
					base64: fileBuffer.toString("base64"),
					originalSize: fileStats.size,
					pageCount: options?.pageCount ?? (await getPDFPageCount(filePath)),
				},
			},
		};
	} catch (error) {
		return {
			success: false,
			error: {
				reason: "unknown",
				message: error instanceof Error ? error.message : String(error),
			},
		};
	}
}

export async function renderPdfPagesToImageBlocks(
	filePath: string,
	options?: {
		firstPage?: number;
		lastPage?: number;
		autoResize?: boolean;
		signal?: AbortSignal;
		mtimeMs?: number;
	},
): Promise<ImageContent[]> {
	const autoResize = options?.autoResize ?? true;
	const mtimeMs = options?.mtimeMs ?? (await stat(filePath)).mtimeMs;
	const lastPage = options?.lastPage;
	const cacheEntry = await getPDFCacheEntry(filePath, mtimeMs, {
		firstPage: options?.firstPage,
		lastPage: lastPage !== undefined && Number.isFinite(lastPage) ? lastPage : undefined,
	});

	let imagePaths = cacheEntry.imagePaths;
	if (imagePaths.length === 0) {
		const extractResult = await extractPDFPages(filePath, {
			firstPage: options?.firstPage,
			lastPage: lastPage !== undefined && Number.isFinite(lastPage) ? lastPage : undefined,
			outputDir: cacheEntry.outputDir,
			signal: options?.signal,
		});
		if (!extractResult.success) {
			throw new Error(extractResult.error.message);
		}
		imagePaths = extractResult.data.file.imagePaths;
	}

	return (
		await Promise.all(
			imagePaths.map(async (imagePath) => {
				const base64Image = (await readFile(imagePath)).toString("base64");
				if (!autoResize) {
					return {
						type: "image" as const,
						mimeType: "image/jpeg",
						data: base64Image,
					};
				}

				const resized = await resizeImage({
					type: "image",
					data: base64Image,
					mimeType: "image/jpeg",
				});
				if (!resized) {
					return null;
				}
				return {
					type: "image" as const,
					mimeType: resized.mimeType,
					data: resized.data,
				};
			}),
		)
	).filter((block): block is ImageContent => block !== null);
}

export async function extractPDFPages(
	filePath: string,
	options?: {
		firstPage?: number;
		lastPage?: number;
		outputDir?: string;
		signal?: AbortSignal;
	},
): Promise<PDFResult<PDFExtractPagesData>> {
	try {
		const fileStats = await stat(filePath);
		if (fileStats.size === 0) {
			return {
				success: false,
				error: { reason: "empty", message: `PDF file is empty: ${filePath}` },
			};
		}

		if (fileStats.size > PDF_MAX_EXTRACT_SIZE) {
			return {
				success: false,
				error: {
					reason: "too_large",
					message: `PDF file exceeds maximum allowed size for page extraction (${PDF_MAX_EXTRACT_SIZE} bytes).`,
				},
			};
		}

		if (!(await isPdftoppmAvailable())) {
			return {
				success: false,
				error: {
					reason: "unavailable",
					message:
						"pdftoppm is not installed. Install poppler with `brew install poppler` on macOS or the equivalent package for your system.",
				},
			};
		}

		const outputDir = options?.outputDir ?? join(tmpdir(), `pi-pdf-${randomUUID()}`);
		await mkdir(outputDir, { recursive: true });

		const prefix = join(outputDir, "page");
		const args = ["-jpeg", "-r", "100"];
		if (options?.firstPage) {
			args.push("-f", String(options.firstPage));
		}
		if (options?.lastPage && Number.isFinite(options.lastPage)) {
			args.push("-l", String(options.lastPage));
		}
		args.push(filePath, prefix);

		const result = await execCommand("pdftoppm", args, dirname(filePath), {
			signal: options?.signal,
			timeout: 120_000,
		});
		if (result.code !== 0) {
			if (/password/i.test(result.stderr)) {
				return {
					success: false,
					error: {
						reason: "password_protected",
						message: "PDF is password-protected. Provide an unprotected version to continue.",
					},
				};
			}
			if (/damaged|corrupt|invalid/i.test(result.stderr)) {
				return {
					success: false,
					error: {
						reason: "corrupted",
						message: "PDF file is corrupted or invalid.",
					},
				};
			}
			return {
				success: false,
				error: {
					reason: "unknown",
					message: result.stderr || "pdftoppm failed to render PDF pages.",
				},
			};
		}

		const entries = await readdir(outputDir);
		const imagePaths = entries
			.filter((entry) => entry.endsWith(".jpg"))
			.sort()
			.map((entry) => join(outputDir, entry));
		if (imagePaths.length === 0) {
			return {
				success: false,
				error: {
					reason: "unknown",
					message: "pdftoppm produced no output pages. The PDF may be invalid.",
				},
			};
		}

		return {
			success: true,
			data: {
				type: "parts",
				file: {
					filePath,
					originalSize: fileStats.size,
					count: imagePaths.length,
					outputDir,
					imagePaths,
					firstPage: options?.firstPage ?? 1,
					lastPage:
						options?.lastPage && Number.isFinite(options.lastPage)
							? options.lastPage
							: (options?.firstPage ?? 1) + imagePaths.length - 1,
				},
			},
		};
	} catch (error) {
		return {
			success: false,
			error: {
				reason: "unknown",
				message: error instanceof Error ? error.message : String(error),
			},
		};
	}
}
