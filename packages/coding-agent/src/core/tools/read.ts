import type { AgentTool } from "@mariozechner/pi-agent-core";
import type { Api, Model, PromptContentBlock } from "@mariozechner/pi-ai";
import { Text } from "@mariozechner/pi-tui";
import { constants } from "fs";
import { access as fsAccess, readFile as fsReadFile, stat as fsStat } from "fs/promises";
import { extname } from "path";
import { type Static, Type } from "typebox";
import { keyHint } from "../../modes/interactive/components/keybinding-hints.js";
import { getLanguageFromPath, highlightCode } from "../../modes/interactive/theme/theme.js";
import {
	clipImageCropRegion,
	formatDimensionNote,
	getImageDimensions,
	type ImageCropRegion,
	resizeImage,
} from "../../utils/image-resize.js";
import { detectSupportedImageMimeTypeFromFile } from "../../utils/mime.js";
import {
	getPDFPageCount,
	PDF_AT_MENTION_INLINE_THRESHOLD,
	PDF_MAX_PAGES_PER_READ,
	parsePDFPageRange,
	renderPdfPagesToImageBlocks,
} from "../../utils/pdf.js";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.js";
import { resolveReadPath } from "./path-utils.js";
import { getTextOutput, invalidArgText, replaceTabs, shortenPath, str } from "./render-utils.js";
import { wrapToolDefinition } from "./tool-definition-wrapper.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, type TruncationResult, truncateHead } from "./truncate.js";

const readRegionSchema = Type.Object({
	left: Type.Number({ description: "Left edge of the crop region in original image pixels", minimum: 0 }),
	top: Type.Number({ description: "Top edge of the crop region in original image pixels", minimum: 0 }),
	width: Type.Number({ description: "Width of the crop region in pixels", exclusiveMinimum: 0 }),
	height: Type.Number({ description: "Height of the crop region in pixels", exclusiveMinimum: 0 }),
});

const readSchema = Type.Object({
	path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
	offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
	pages: Type.Optional(
		Type.String({
			description: `Page range for PDF files (for example "1-5", "3", or "10-20"). Maximum ${PDF_MAX_PAGES_PER_READ} pages per request.`,
		}),
	),
	region: Type.Optional(readRegionSchema),
});

export type ReadToolInput = Static<typeof readSchema>;

export interface ReadToolDetails {
	truncation?: TruncationResult;
	pdf?: {
		pageCount?: number;
		renderedPages?: number;
		firstPage?: number;
		lastPage?: number;
		rangeSize?: number;
		previousRange?: string;
		nextRange?: string;
	};
}

/**
 * Pluggable operations for the read tool.
 * Override these to delegate file reading to remote systems (for example SSH).
 */
export interface ReadOperations {
	/** Read file contents as a Buffer */
	readFile: (absolutePath: string) => Promise<Buffer>;
	/** Check if file is readable (throw if not) */
	access: (absolutePath: string) => Promise<void>;
	/** Detect image MIME type, return null or undefined for non-images */
	detectImageMimeType?: (absolutePath: string) => Promise<string | null | undefined>;
}

const defaultReadOperations: ReadOperations = {
	readFile: (path) => fsReadFile(path),
	access: (path) => fsAccess(path, constants.R_OK),
	detectImageMimeType: detectSupportedImageMimeTypeFromFile,
};

export interface ReadToolOptions {
	/** Whether to auto-resize images to 2000x2000 max. Default: true */
	autoResizeImages?: boolean;
	/** Custom operations for file reading. Default: local filesystem */
	operations?: ReadOperations;
}

function formatReadCall(
	args:
		| {
				path?: string;
				file_path?: string;
				offset?: number;
				limit?: number;
				pages?: string;
				region?: ImageCropRegion;
		  }
		| undefined,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
): string {
	const rawPath = str(args?.file_path ?? args?.path);
	const path = rawPath !== null ? shortenPath(rawPath) : null;
	const offset = args?.offset;
	const limit = args?.limit;
	const pages = args?.pages;
	const region = args?.region;
	const invalidArg = invalidArgText(theme);
	let pathDisplay = path === null ? invalidArg : path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");
	if (offset !== undefined || limit !== undefined) {
		const startLine = offset ?? 1;
		const endLine = limit !== undefined ? startLine + limit - 1 : "";
		pathDisplay += theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
	}
	if (pages) {
		pathDisplay += theme.fg("warning", ` pages=${pages}`);
	}
	if (region) {
		pathDisplay += theme.fg("warning", ` region=${region.left},${region.top},${region.width}x${region.height}`);
	}
	return `${theme.fg("toolTitle", theme.bold("read"))} ${pathDisplay}`;
}

function trimTrailingEmptyLines(lines: string[]): string[] {
	let end = lines.length;
	while (end > 0 && lines[end - 1] === "") {
		end--;
	}
	return lines.slice(0, end);
}

function getNonVisionImageNote(model: Model<Api> | undefined): string | undefined {
	if (!model || model.input.includes("image")) {
		return undefined;
	}
	return "[Current model does not support images. The image will be omitted from this request.]";
}

function getRequestedPageCount(range: { firstPage: number; lastPage: number }): number {
	if (!Number.isFinite(range.lastPage)) {
		return PDF_MAX_PAGES_PER_READ + 1;
	}
	return range.lastPage - range.firstPage + 1;
}

function normalizeReadRegion(region: ImageCropRegion | undefined): ImageCropRegion | undefined {
	if (!region) {
		return undefined;
	}
	if (
		!Number.isFinite(region.left) ||
		!Number.isFinite(region.top) ||
		!Number.isFinite(region.width) ||
		!Number.isFinite(region.height)
	) {
		throw new Error("Invalid region parameter. Use finite numbers for left, top, width, and height.");
	}
	if (region.left < 0 || region.top < 0 || region.width <= 0 || region.height <= 0) {
		throw new Error("Invalid region parameter. left/top must be >= 0 and width/height must be > 0.");
	}
	return region;
}

function formatPageRange(firstPage: number, lastPage: number): string {
	return firstPage === lastPage ? `${firstPage}` : `${firstPage}-${lastPage}`;
}

function buildPdfNavigation(
	firstPage: number,
	lastPage: number,
	pageCount: number | null | undefined,
): { rangeSize: number; previousRange?: string; nextRange?: string } {
	const rangeSize = Math.max(1, lastPage - firstPage + 1);
	if (pageCount === null || pageCount === undefined) {
		const previousRange =
			firstPage > 1 ? formatPageRange(Math.max(1, firstPage - rangeSize), firstPage - 1) : undefined;
		return {
			rangeSize,
			previousRange,
			nextRange: formatPageRange(lastPage + 1, lastPage + rangeSize),
		};
	}

	const previousRange = firstPage > 1 ? formatPageRange(Math.max(1, firstPage - rangeSize), firstPage - 1) : undefined;
	const nextRange =
		lastPage < pageCount ? formatPageRange(lastPage + 1, Math.min(pageCount, lastPage + rangeSize)) : undefined;
	return { rangeSize, previousRange, nextRange };
}

function buildPdfReadNote(
	firstPage: number,
	lastPage: number,
	pageCount: number | null | undefined,
	navigation: { nextRange?: string },
	options?: { autoSelectedFirstRange?: boolean; totalUnavailable?: boolean },
): string {
	const range = firstPage === lastPage ? `page ${firstPage}` : `pages ${firstPage}-${lastPage}`;
	if (pageCount !== null && pageCount !== undefined) {
		const autoSelectedNote = options?.autoSelectedFirstRange ? " Auto-selected first range." : "";
		return navigation.nextRange
			? `Showing PDF ${range} of ${pageCount}.${autoSelectedNote} Use pages="${navigation.nextRange}" to continue.`
			: `Showing PDF ${range} of ${pageCount}.${autoSelectedNote}`;
	}
	const unavailableNote = options?.totalUnavailable ? " Total page count unavailable." : "";
	const autoSelectedNote = options?.autoSelectedFirstRange ? " Auto-selected first range." : "";
	return navigation.nextRange
		? `Showing PDF ${range}.${unavailableNote}${autoSelectedNote} Use pages="${navigation.nextRange}" to continue.`
		: `Showing PDF ${range}.${unavailableNote}${autoSelectedNote}`;
}

function buildPdfPartialReadNote(
	firstPage: number,
	lastPage: number,
	pageCount: number | null | undefined,
	requestedPageCount: number,
	renderedPageCount: number,
	navigation: { nextRange?: string },
): string {
	const range = firstPage === lastPage ? `page ${firstPage}` : `pages ${firstPage}-${lastPage}`;
	const totalSuffix = pageCount !== null && pageCount !== undefined ? ` of ${pageCount}` : "";
	const continueSuffix = navigation.nextRange ? ` Use pages="${navigation.nextRange}" to continue.` : "";
	return `Prepared ${renderedPageCount} of ${requestedPageCount} requested PDF ${range}${totalSuffix}.${continueSuffix}`;
}

function buildPdfCropGuidance(firstPage: number, lastPage: number): string {
	if (firstPage === lastPage) {
		return `[To inspect a smaller area, re-read this page with pages="${firstPage}" and region={left,top,width,height}.]`;
	}
	return '[To inspect a smaller area, re-read one page with pages="N" and region={left,top,width,height}.]';
}

function buildImageCropGuidance(): string {
	return "[To inspect a smaller area, re-read this image with region={left,top,width,height}.]";
}

async function prepareInlineImageBlock(
	image: Extract<PromptContentBlock, { type: "image" }>,
	options: {
		autoResize: boolean;
		region?: ImageCropRegion;
		includeDimensionNote?: boolean;
	},
): Promise<{ block?: Extract<PromptContentBlock, { type: "image" }>; dimensionNote?: string }> {
	let knownDimensions: { width: number; height: number } | null | undefined;
	if (options.region) {
		knownDimensions = await getImageDimensions(image);
		if (!knownDimensions) {
			throw new Error("Image processing failed while preparing the requested crop.");
		}
		if (!clipImageCropRegion(options.region, knownDimensions.width, knownDimensions.height)) {
			throw new Error("The requested region does not overlap the image bounds.");
		}
	}

	if (!options.autoResize && !options.region) {
		return { block: image };
	}

	const resized = await resizeImage(image, options.region ? { crop: options.region } : undefined);
	if (!resized) {
		const fallbackDimensions = knownDimensions ?? (await getImageDimensions(image));
		if (!fallbackDimensions) {
			throw new Error("Image processing failed while preparing the attachment.");
		}
		return {};
	}

	return {
		block: {
			type: "image",
			data: resized.data,
			mimeType: resized.mimeType,
		},
		dimensionNote: formatDimensionNote(resized, {
			includeOriginalDimensions: options.includeDimensionNote,
		}),
	};
}

function formatReadResult(
	args: { path?: string; file_path?: string; offset?: number; limit?: number } | undefined,
	result: { content: PromptContentBlock[]; details?: ReadToolDetails },
	options: ToolRenderResultOptions,
	theme: typeof import("../../modes/interactive/theme/theme.js").theme,
	showImages: boolean,
): string {
	const rawPath = str(args?.file_path ?? args?.path);
	const output = getTextOutput(result as any, showImages);
	const lang = rawPath ? getLanguageFromPath(rawPath) : undefined;
	const renderedLines = lang ? highlightCode(replaceTabs(output), lang) : output.split("\n");
	const lines = trimTrailingEmptyLines(renderedLines);
	const maxLines = options.expanded ? lines.length : 10;
	const displayLines = lines.slice(0, maxLines);
	const remaining = lines.length - maxLines;
	let text = `\n${displayLines.map((line) => (lang ? replaceTabs(line) : theme.fg("toolOutput", replaceTabs(line)))).join("\n")}`;
	if (remaining > 0) {
		text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`;
	}

	const truncation = result.details?.truncation;
	if (truncation?.truncated) {
		if (truncation.firstLineExceedsLimit) {
			text += `\n${theme.fg("warning", `[First line exceeds ${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit]`)}`;
		} else if (truncation.truncatedBy === "lines") {
			text += `\n${theme.fg("warning", `[Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${truncation.maxLines ?? DEFAULT_MAX_LINES} line limit)]`)}`;
		} else {
			text += `\n${theme.fg("warning", `[Truncated: ${truncation.outputLines} lines shown (${formatSize(truncation.maxBytes ?? DEFAULT_MAX_BYTES)} limit)]`)}`;
		}
	}
	return text;
}

export function createReadToolDefinition(
	cwd: string,
	options?: ReadToolOptions,
): ToolDefinition<typeof readSchema, ReadToolDetails | undefined> {
	const autoResizeImages = options?.autoResizeImages ?? true;
	const ops = options?.operations ?? defaultReadOperations;
	return {
		name: "read",
		label: "read",
		description: `Read the contents of a file. Supports text files, images (jpg, png, gif, webp), and PDFs. Images and rendered PDF pages are sent as attachments. For text files, output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large text files, pages for large PDFs, and region for image/PDF crops.`,
		promptSnippet: "Read file contents",
		promptGuidelines: ["Use read to examine files instead of cat or sed."],
		parameters: readSchema,
		async execute(
			_toolCallId,
			{
				path,
				offset,
				limit,
				pages,
				region,
			}: { path: string; offset?: number; limit?: number; pages?: string; region?: ImageCropRegion },
			signal?: AbortSignal,
			_onUpdate?,
			ctx?,
		) {
			const absolutePath = resolveReadPath(path, cwd);
			const requestedRegion = normalizeReadRegion(region);
			return new Promise<{ content: PromptContentBlock[]; details: ReadToolDetails | undefined }>(
				(resolve, reject) => {
					if (signal?.aborted) {
						reject(new Error("Operation aborted"));
						return;
					}
					let aborted = false;
					const onAbort = () => {
						aborted = true;
						reject(new Error("Operation aborted"));
					};
					signal?.addEventListener("abort", onAbort, { once: true });

					(async () => {
						try {
							// Check if file exists and is readable.
							await ops.access(absolutePath);
							if (aborted) return;
							const mimeType = ops.detectImageMimeType ? await ops.detectImageMimeType(absolutePath) : undefined;
							let content: PromptContentBlock[];
							let details: ReadToolDetails | undefined;
							const nonVisionImageNote = getNonVisionImageNote(ctx?.model);
							const isPdf = extname(absolutePath).toLowerCase() === ".pdf";
							if (isPdf) {
								let pageRange: { firstPage: number; lastPage: number } | undefined;
								if (pages !== undefined) {
									pageRange = parsePDFPageRange(pages) ?? undefined;
									if (!pageRange) {
										throw new Error(
											`Invalid pages parameter: "${pages}". Use formats like "1-5", "3", or "10-20". Pages are 1-indexed.`,
										);
									}
									if (getRequestedPageCount(pageRange) > PDF_MAX_PAGES_PER_READ) {
										throw new Error(
											`Page range "${pages}" exceeds maximum of ${PDF_MAX_PAGES_PER_READ} pages per request.`,
										);
									}
								}

								const [pageCount, fileStats] = await Promise.all([
									getPDFPageCount(absolutePath, signal),
									fsStat(absolutePath),
								]);
								if (pageRange && pageCount !== null && pageRange.firstPage > pageCount) {
									throw new Error(
										`Page range "${pages}" starts beyond the end of the PDF (${pageCount} pages total).`,
									);
								}

								let effectiveRange = pageRange
									? {
											firstPage: pageRange.firstPage,
											lastPage:
												pageCount !== null && Number.isFinite(pageRange.lastPage)
													? Math.min(pageRange.lastPage, pageCount)
													: pageRange.lastPage,
										}
									: undefined;
								const autoSelectedFirstRange =
									!effectiveRange && pageCount !== null && pageCount > PDF_AT_MENTION_INLINE_THRESHOLD;
								const autoSelectedUnknownFirstRange = !effectiveRange && pageCount === null;
								if (!effectiveRange) {
									if (pageCount !== null) {
										effectiveRange = {
											firstPage: 1,
											lastPage: Math.min(pageCount, PDF_AT_MENTION_INLINE_THRESHOLD),
										};
									} else {
										effectiveRange = {
											firstPage: 1,
											lastPage: PDF_AT_MENTION_INLINE_THRESHOLD,
										};
									}
								}
								if (requestedRegion) {
									if (!effectiveRange) {
										if (pageCount === 1) {
											effectiveRange = { firstPage: 1, lastPage: 1 };
										} else if (pageCount === null) {
											throw new Error(
												'PDF region reads require exactly one page. Use pages="N" when the PDF page count is unavailable.',
											);
										} else {
											throw new Error('PDF region reads require exactly one page. Use pages="N".');
										}
									}
									if (
										!Number.isFinite(effectiveRange.lastPage) ||
										effectiveRange.firstPage !== effectiveRange.lastPage
									) {
										throw new Error('PDF region reads require exactly one page. Use pages="N".');
									}
								}

								const needsDetailedPageProcessing =
									requestedRegion !== undefined || effectiveRange.firstPage === effectiveRange.lastPage;
								let imageBlocks: Array<Extract<PromptContentBlock, { type: "image" }>> = [];
								let dimensionNote: string | undefined;

								if (needsDetailedPageProcessing) {
									const rawBlocks = await renderPdfPagesToImageBlocks(absolutePath, {
										firstPage: effectiveRange.firstPage,
										lastPage: effectiveRange.lastPage,
										autoResize: false,
										signal,
										mtimeMs: fileStats.mtimeMs,
									});

									for (const rawBlock of rawBlocks) {
										const preparedBlock = await prepareInlineImageBlock(rawBlock, {
											autoResize: autoResizeImages,
											region: requestedRegion,
											includeDimensionNote: rawBlocks.length === 1,
										});
										if (preparedBlock.block) {
											imageBlocks.push(preparedBlock.block);
										}
										if (!dimensionNote && preparedBlock.dimensionNote) {
											dimensionNote = preparedBlock.dimensionNote;
										}
									}
								} else {
									imageBlocks = await renderPdfPagesToImageBlocks(absolutePath, {
										firstPage: effectiveRange.firstPage,
										lastPage: effectiveRange.lastPage,
										autoResize: autoResizeImages,
										signal,
										mtimeMs: fileStats.mtimeMs,
									});
								}

								const renderedPageCount = imageBlocks.length;
								const firstPage = effectiveRange.firstPage;
								const requestedLastPage =
									Number.isFinite(effectiveRange.lastPage) && effectiveRange.lastPage !== undefined
										? effectiveRange.lastPage
										: renderedPageCount > 0
											? firstPage + renderedPageCount - 1
											: firstPage;
								const requestedPageCount = Math.max(1, requestedLastPage - firstPage + 1);
								const allowPartialRangeNote = !(autoSelectedUnknownFirstRange && pages === undefined);
								const lastPage = allowPartialRangeNote
									? requestedLastPage
									: renderedPageCount > 0
										? firstPage + renderedPageCount - 1
										: firstPage;
								const navigation = buildPdfNavigation(firstPage, lastPage, pageCount);
								let pdfNote =
									renderedPageCount > 0 && renderedPageCount < requestedPageCount && allowPartialRangeNote
										? buildPdfPartialReadNote(
												firstPage,
												lastPage,
												pageCount,
												requestedPageCount,
												renderedPageCount,
												navigation,
											)
										: buildPdfReadNote(firstPage, lastPage, pageCount, navigation, {
												autoSelectedFirstRange: autoSelectedFirstRange || autoSelectedUnknownFirstRange,
												totalUnavailable: pageCount === null,
											});
								if (dimensionNote) {
									pdfNote += `\n${dimensionNote}`;
								}
								if (renderedPageCount > 0) {
									pdfNote += `\n${buildPdfCropGuidance(firstPage, lastPage)}`;
								}
								if (renderedPageCount === 0) {
									pdfNote +=
										"\n[Requested PDF pages were omitted because they could not be resized below the inline image size limit.]";
								} else if (renderedPageCount < requestedPageCount && allowPartialRangeNote) {
									pdfNote +=
										"\n[Some requested PDF pages were omitted because they could not be resized below the inline image size limit.]";
								}
								if (nonVisionImageNote) {
									pdfNote += `\n${nonVisionImageNote}`;
								}
								content = [{ type: "text", text: pdfNote }, ...imageBlocks];
								details = {
									pdf: {
										pageCount: pageCount ?? undefined,
										renderedPages: renderedPageCount,
										firstPage,
										lastPage,
										rangeSize: navigation.rangeSize,
										previousRange: navigation.previousRange,
										nextRange: navigation.nextRange,
									},
								};
							} else if (mimeType) {
								if (pages !== undefined) {
									throw new Error("The pages parameter is only valid for PDF files.");
								}
								// Read image as binary.
								const buffer = await ops.readFile(absolutePath);
								const base64 = buffer.toString("base64");
								if (autoResizeImages || requestedRegion) {
									const preparedBlock = await prepareInlineImageBlock(
										{ type: "image", data: base64, mimeType },
										{
											autoResize: autoResizeImages,
											region: requestedRegion,
											includeDimensionNote: true,
										},
									);
									if (!preparedBlock.block) {
										let textNote = `Read image file [${mimeType}]\n[Image omitted: could not be resized below the inline image size limit.]`;
										if (nonVisionImageNote) textNote += `\n${nonVisionImageNote}`;
										content = [{ type: "text", text: textNote }];
									} else {
										let textNote = `Read image file [${preparedBlock.block.mimeType}]`;
										if (preparedBlock.dimensionNote) textNote += `\n${preparedBlock.dimensionNote}`;
										textNote += `\n${buildImageCropGuidance()}`;
										if (nonVisionImageNote) textNote += `\n${nonVisionImageNote}`;
										content = [{ type: "text", text: textNote }, preparedBlock.block];
									}
								} else {
									let textNote = `Read image file [${mimeType}]`;
									textNote += `\n${buildImageCropGuidance()}`;
									if (nonVisionImageNote) textNote += `\n${nonVisionImageNote}`;
									content = [
										{ type: "text", text: textNote },
										{ type: "image", data: base64, mimeType },
									];
								}
							} else {
								if (pages !== undefined) {
									throw new Error("The pages parameter is only valid for PDF files.");
								}
								if (requestedRegion) {
									throw new Error("The region parameter is only valid for images and PDFs.");
								}
								// Read text content.
								const buffer = await ops.readFile(absolutePath);
								const textContent = buffer.toString("utf-8");
								const allLines = textContent.split("\n");
								const totalFileLines = allLines.length;
								// Apply offset if specified. Convert from 1-indexed input to 0-indexed array access.
								const startLine = offset ? Math.max(0, offset - 1) : 0;
								const startLineDisplay = startLine + 1;
								// Check if offset is out of bounds.
								if (startLine >= allLines.length) {
									throw new Error(`Offset ${offset} is beyond end of file (${allLines.length} lines total)`);
								}
								let selectedContent: string;
								let userLimitedLines: number | undefined;
								// If limit is specified by the user, honor it first. Otherwise truncateHead decides.
								if (limit !== undefined) {
									const endLine = Math.min(startLine + limit, allLines.length);
									selectedContent = allLines.slice(startLine, endLine).join("\n");
									userLimitedLines = endLine - startLine;
								} else {
									selectedContent = allLines.slice(startLine).join("\n");
								}
								// Apply truncation, respecting both line and byte limits.
								const truncation = truncateHead(selectedContent);
								let outputText: string;
								if (truncation.firstLineExceedsLimit) {
									// First line alone exceeds the byte limit. Point the model at a bash fallback.
									const firstLineSize = formatSize(Buffer.byteLength(allLines[startLine], "utf-8"));
									outputText = `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${startLineDisplay}p' ${path} | head -c ${DEFAULT_MAX_BYTES}]`;
									details = { truncation };
								} else if (truncation.truncated) {
									// Truncation occurred. Build an actionable continuation notice.
									const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
									const nextOffset = endLineDisplay + 1;
									outputText = truncation.content;
									if (truncation.truncatedBy === "lines") {
										outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
									} else {
										outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
									}
									details = { truncation };
								} else if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
									// User-specified limit stopped early, but the file still has more content.
									const remaining = allLines.length - (startLine + userLimitedLines);
									const nextOffset = startLine + userLimitedLines + 1;
									outputText = `${truncation.content}\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
								} else {
									// No truncation and no remaining user-limited content.
									outputText = truncation.content;
								}
								content = [{ type: "text", text: outputText }];
							}

							if (aborted) return;
							signal?.removeEventListener("abort", onAbort);
							resolve({ content, details });
						} catch (error: any) {
							signal?.removeEventListener("abort", onAbort);
							if (!aborted) reject(error);
						}
					})();
				},
			);
		},
		renderCall(args, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatReadCall(args, theme));
			return text;
		},
		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(formatReadResult(context.args, result as any, options, theme, context.showImages));
			return text;
		},
	};
}

export function createReadTool(cwd: string, options?: ReadToolOptions): AgentTool<typeof readSchema> {
	return wrapToolDefinition(createReadToolDefinition(cwd, options));
}
