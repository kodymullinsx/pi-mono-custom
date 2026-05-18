/**
 * Process @file CLI arguments into text content and first-class attachments
 */

import { access, readFile, stat } from "node:fs/promises";
import type { Api, AttachmentContent, ImageContent, Model } from "@earendil-works/pi-ai";
import chalk from "chalk";
import { basename, extname, resolve } from "path";
import { resolveReadPath } from "../core/tools/path-utils.js";
import { formatDimensionNote, getImageDimensions, resizeImage } from "../utils/image-resize.js";
import { detectSupportedImageMimeTypeFromFile } from "../utils/mime.js";
import { getPDFPageCount, PDF_AT_MENTION_INLINE_THRESHOLD, renderPdfPagesToImageBlocks } from "../utils/pdf.js";

export interface ProcessedFiles {
	text: string;
	attachments: AttachmentContent[];
}

export interface ProcessFileOptions {
	/** Whether to auto-resize images to 2000x2000 max. Default: true */
	autoResizeImages?: boolean;
	/** Optional target model so @file handling can prepare model-compatible attachments. */
	model?: Model<Api>;
}

const DOCUMENT_MIME_TYPES_BY_EXTENSION = new Map<string, string>([
	[".pdf", "application/pdf"],
	[".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
	[".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
	[".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
	[".xls", "application/vnd.ms-excel"],
	[".xlsm", "application/vnd.ms-excel.sheet.macroEnabled.12"],
]);

function detectSupportedDocumentMimeTypeFromFile(filePath: string): string | null {
	return DOCUMENT_MIME_TYPES_BY_EXTENSION.get(extname(filePath).toLowerCase()) ?? null;
}

function supportsImageInput(model?: Model<Api>): boolean {
	return model?.input.includes("image") ?? false;
}

function buildPdfReferenceText(absolutePath: string, pageCount: number | null, reason: string): string {
	const pageCountText = pageCount === null ? "an unknown number of pages" : `${pageCount} page(s)`;
	return `<file name="${absolutePath}">[PDF referenced only: ${basename(absolutePath)} has ${pageCountText}. ${reason} Use the read tool with pages="1-5" to inspect specific ranges.]</file>\n`;
}

function formatPdfPageRange(firstPage: number, lastPage: number): string {
	return firstPage === lastPage ? `${firstPage}` : `${firstPage}-${lastPage}`;
}

function buildPdfContinuationNote(nextRange: string | undefined): string {
	return nextRange ? ` Use the read tool with pages="${nextRange}" to continue.` : "";
}

async function processPdfFile(
	absolutePath: string,
	options: { autoResizeImages: boolean; model?: Model<Api>; mtimeMs?: number },
): Promise<ProcessedFiles> {
	const pageCount = await getPDFPageCount(absolutePath);

	if (!supportsImageInput(options.model)) {
		return {
			text: buildPdfReferenceText(
				absolutePath,
				pageCount,
				"The current model does not support inline PDF rendering in this path.",
			),
			attachments: [],
		};
	}

	const firstPage = 1;
	const lastPage =
		pageCount === null ? PDF_AT_MENTION_INLINE_THRESHOLD : Math.min(pageCount, PDF_AT_MENTION_INLINE_THRESHOLD);
	const requestedPageCount = Math.max(1, lastPage - firstPage + 1);
	const nextRange =
		pageCount === null
			? formatPdfPageRange(lastPage + 1, lastPage + requestedPageCount)
			: lastPage < pageCount
				? formatPdfPageRange(lastPage + 1, Math.min(pageCount, lastPage + requestedPageCount))
				: undefined;

	const attachments = await renderPdfPagesToImageBlocks(absolutePath, {
		firstPage,
		lastPage,
		autoResize: options.autoResizeImages,
		mtimeMs: options.mtimeMs,
	});
	if (attachments.length === 0) {
		const requestedRange = formatPdfPageRange(firstPage, lastPage);
		const totalSuffix = pageCount === null ? " Total page count unavailable." : ` of ${pageCount}.`;
		console.error(chalk.yellow(`Warning: PDF pages ${requestedRange} omitted (exceeds size limit): ${absolutePath}`));
		return {
			text:
				`<file name="${absolutePath}">[` +
				`PDF pages ${requestedRange}${totalSuffix} could not be attached as images because they could not be resized below the inline image size limit.` +
				`${buildPdfContinuationNote(nextRange)}` +
				`]</file>\n`,
			attachments: [],
		};
	}

	if (pageCount === null) {
		const attachedRange = formatPdfPageRange(firstPage, firstPage + attachments.length - 1);
		return {
			text:
				`<file name="${absolutePath}">[` +
				`PDF pages ${attachedRange} attached as images from ${basename(absolutePath)}. Total page count unavailable.` +
				`${buildPdfContinuationNote(nextRange)}` +
				`]</file>\n`,
			attachments,
		};
	}

	if (attachments.length < requestedPageCount) {
		const requestedRange = formatPdfPageRange(firstPage, lastPage);
		return {
			text:
				`<file name="${absolutePath}">[` +
				`Only ${attachments.length} of ${requestedPageCount} PDF page(s) from ${basename(absolutePath)} ` +
				`in pages ${requestedRange}${pageCount ? ` of ${pageCount}` : ""} could be attached as images. Remaining page(s) were omitted because they could not be resized below the inline image size limit.` +
				`${buildPdfContinuationNote(nextRange)}` +
				`]</file>\n`,
			attachments,
		};
	}

	const attachedRange = formatPdfPageRange(firstPage, lastPage);
	const totalSuffix = pageCount > PDF_AT_MENTION_INLINE_THRESHOLD ? ` of ${pageCount}` : "";
	return {
		text:
			`<file name="${absolutePath}">[` +
			`PDF pages ${attachedRange}${totalSuffix} attached as images from ${basename(absolutePath)}.` +
			`${pageCount > PDF_AT_MENTION_INLINE_THRESHOLD ? " Auto-attached first range." : ""}` +
			`${buildPdfContinuationNote(nextRange)}` +
			`]</file>\n`,
		attachments,
	};
}

/** Process @file arguments into text content and first-class attachments */
export async function processFileArguments(fileArgs: string[], options?: ProcessFileOptions): Promise<ProcessedFiles> {
	const autoResizeImages = options?.autoResizeImages ?? true;
	let text = "";
	const attachments: AttachmentContent[] = [];

	for (const fileArg of fileArgs) {
		// Expand and resolve path (handles ~ expansion and macOS screenshot Unicode spaces)
		const absolutePath = resolve(resolveReadPath(fileArg, process.cwd()));

		// Check if file exists
		try {
			await access(absolutePath);
		} catch {
			console.error(chalk.red(`Error: File not found: ${absolutePath}`));
			process.exit(1);
		}

		// Check if file is empty
		const stats = await stat(absolutePath);
		if (stats.size === 0) {
			// Skip empty files
			continue;
		}

		const mimeType = await detectSupportedImageMimeTypeFromFile(absolutePath);

		if (mimeType) {
			// Handle image file
			const content = await readFile(absolutePath);
			const base64Content = content.toString("base64");

			let attachment: ImageContent;
			let dimensionNote: string | undefined;

			if (autoResizeImages) {
				const resized = await resizeImage({ type: "image", data: base64Content, mimeType });
				if (!resized) {
					const dimensions = await getImageDimensions({ type: "image", data: base64Content, mimeType });
					if (!dimensions) {
						console.error(chalk.yellow(`Warning: Image omitted (could not process): ${absolutePath}`));
						text += `<file name="${absolutePath}">[Image omitted: Pi could not process this image for inline attachment.]</file>\n`;
						continue;
					}
					console.error(chalk.yellow(`Warning: Image omitted (exceeds size limit): ${absolutePath}`));
					text += `<file name="${absolutePath}">[Image omitted: could not be resized below the inline image size limit.]</file>\n`;
					continue;
				}
				dimensionNote = formatDimensionNote(resized);
				attachment = {
					type: "image",
					mimeType: resized.mimeType,
					data: resized.data,
				};
			} else {
				attachment = {
					type: "image",
					mimeType,
					data: base64Content,
				};
			}

			attachments.push(attachment);

			// Add text reference to image with optional dimension note
			if (dimensionNote) {
				text += `<file name="${absolutePath}">${dimensionNote}</file>\n`;
			} else {
				text += `<file name="${absolutePath}"></file>\n`;
			}
			continue;
		}

		const documentMimeType = detectSupportedDocumentMimeTypeFromFile(absolutePath);
		if (documentMimeType) {
			if (documentMimeType === "application/pdf") {
				const processedPdf = await processPdfFile(absolutePath, {
					autoResizeImages,
					model: options?.model,
					mtimeMs: stats.mtimeMs,
				});
				text += processedPdf.text;
				attachments.push(...processedPdf.attachments);
				continue;
			}

			text += `<file name="${absolutePath}">[Document referenced only: ${basename(absolutePath)} cannot be sent inline in this path yet. Convert it to PDF or extract text before attaching.]</file>\n`;
		} else {
			// Handle text file
			try {
				const content = await readFile(absolutePath, "utf-8");
				text += `<file name="${absolutePath}">\n${content}\n</file>\n`;
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				console.error(chalk.red(`Error: Could not read file ${absolutePath}: ${message}`));
				process.exit(1);
			}
		}
	}

	return { text, attachments };
}
