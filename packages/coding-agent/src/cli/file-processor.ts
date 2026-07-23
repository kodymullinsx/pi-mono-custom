/**
 * Process @file CLI arguments into text content and first-class attachments.
 */

import { access, readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import type { Api, AttachmentContent, ImageContent, Model } from "@earendil-works/pi-ai";
import chalk from "chalk";
import { resolveReadPath } from "../core/tools/path-utils.ts";
import { processImage } from "../utils/image-process.ts";
import { detectSupportedImageMimeTypeFromFile } from "../utils/mime.ts";
import { getPDFPageCount, PDF_AT_MENTION_INLINE_THRESHOLD, renderPdfPagesToImageBlocks } from "../utils/pdf.ts";

export interface ProcessedFiles {
	text: string;
	attachments: AttachmentContent[];
	/** @deprecated use attachments */
	images: ImageContent[];
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

function formatPdfPageRange(firstPage: number, lastPage: number): string {
	return firstPage === lastPage ? `${firstPage}` : `${firstPage}-${lastPage}`;
}

function buildPdfContinuationNote(nextRange: string | undefined): string {
	return nextRange ? ` Use the read tool with pages="${nextRange}" to continue.` : "";
}

function buildPdfReferenceText(absolutePath: string, pageCount: number | null, reason: string): string {
	const pageCountText = pageCount === null ? "an unknown number of pages" : `${pageCount} page(s)`;
	return `<file name="${absolutePath}">[PDF referenced only: ${basename(absolutePath)} has ${pageCountText}. ${reason} Use the read tool with pages="1-5" to inspect specific ranges.]</file>\n`;
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
			images: [],
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
		pageCount,
		autoResize: options.autoResizeImages,
		mtimeMs: options.mtimeMs,
	});
	if (attachments.length === 0) {
		const requestedRange = formatPdfPageRange(firstPage, lastPage);
		const totalSuffix = pageCount === null ? " Total page count unavailable." : ` of ${pageCount}.`;
		console.error(chalk.yellow(`Warning: PDF pages ${requestedRange} omitted (exceeds size limit): ${absolutePath}`));
		return {
			text: `<file name="${absolutePath}">[PDF pages ${requestedRange}${totalSuffix} could not be attached as images because they could not be resized below the inline image size limit.${buildPdfContinuationNote(nextRange)}]</file>\n`,
			attachments: [],
			images: [],
		};
	}

	if (pageCount === null) {
		const attachedRange = formatPdfPageRange(firstPage, firstPage + attachments.length - 1);
		return {
			text: `<file name="${absolutePath}">[PDF pages ${attachedRange} attached as images from ${basename(absolutePath)}. Total page count unavailable.${buildPdfContinuationNote(nextRange)}]</file>\n`,
			attachments,
			images: attachments,
		};
	}

	if (attachments.length < requestedPageCount) {
		const requestedRange = formatPdfPageRange(firstPage, lastPage);
		return {
			text: `<file name="${absolutePath}">[Only ${attachments.length} of ${requestedPageCount} PDF page(s) from ${basename(absolutePath)} in pages ${requestedRange} of ${pageCount} could be attached as images. Remaining page(s) were omitted because they could not be resized below the inline image size limit.${buildPdfContinuationNote(nextRange)}]</file>\n`,
			attachments,
			images: attachments,
		};
	}

	const attachedRange = formatPdfPageRange(firstPage, lastPage);
	const totalSuffix = pageCount > PDF_AT_MENTION_INLINE_THRESHOLD ? ` of ${pageCount}` : "";
	return {
		text: `<file name="${absolutePath}">[PDF pages ${attachedRange}${totalSuffix} attached as images from ${basename(absolutePath)}.${pageCount > PDF_AT_MENTION_INLINE_THRESHOLD ? " Auto-attached first range." : ""}${buildPdfContinuationNote(nextRange)}]</file>\n`,
		attachments,
		images: attachments,
	};
}

/** Process @file arguments into text content and first-class attachments. */
export async function processFileArguments(fileArgs: string[], options?: ProcessFileOptions): Promise<ProcessedFiles> {
	const autoResizeImages = options?.autoResizeImages ?? true;
	let text = "";
	const attachments: AttachmentContent[] = [];

	for (const fileArg of fileArgs) {
		const absolutePath = resolve(resolveReadPath(fileArg, process.cwd()));
		try {
			await access(absolutePath);
		} catch {
			console.error(chalk.red(`Error: File not found: ${absolutePath}`));
			process.exit(1);
		}

		const stats = await stat(absolutePath);
		if (stats.size === 0) {
			text += `<file name="${absolutePath}">[File is empty.]</file>\n`;
			continue;
		}

		const mimeType = await detectSupportedImageMimeTypeFromFile(absolutePath);
		if (mimeType) {
			const content = await readFile(absolutePath);
			const processed = await processImage(content, mimeType, { autoResizeImages });
			if (!processed.ok) {
				text += `<file name="${absolutePath}">${processed.message}</file>\n`;
				continue;
			}

			const attachment: ImageContent = {
				type: "image",
				mimeType: processed.mimeType,
				data: processed.data,
			};
			attachments.push(attachment);
			text += `<file name="${absolutePath}">${processed.hints.join("\n")}</file>\n`;
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
			continue;
		}

		try {
			const content = await readFile(absolutePath, "utf-8");
			text += `<file name="${absolutePath}">\n${content}\n</file>\n`;
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(chalk.red(`Error: Could not read file ${absolutePath}: ${message}`));
			process.exit(1);
		}
	}

	return {
		text,
		attachments,
		images: attachments.filter((attachment): attachment is ImageContent => attachment.type === "image"),
	};
}
