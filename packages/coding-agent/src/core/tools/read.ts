import { basename, dirname, extname, isAbsolute, relative, resolve as resolvePath, sep } from "node:path";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Api, ImageContent, Model, PromptContentBlock, TextContent } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { constants } from "fs";
import { access as fsAccess, readFile as fsReadFile, stat as fsStat } from "fs/promises";
import { type Static, Type } from "typebox";
import { getReadmePath } from "../../config.ts";
import { keyHint, keyText } from "../../modes/interactive/components/keybinding-hints.ts";
import { getLanguageFromPath, highlightCode, type Theme } from "../../modes/interactive/theme/theme.ts";
import { processImage } from "../../utils/image-process.ts";
import {
	clipImageCropRegion,
	formatDimensionNote,
	getImageDimensions,
	type ImageCropRegion,
	resizeImage,
} from "../../utils/image-resize.ts";
import { detectSupportedImageMimeTypeFromFile } from "../../utils/mime.ts";
import { formatPathRelativeToCwdOrAbsolute } from "../../utils/paths.ts";
import {
	getPDFPageCount,
	PDF_AT_MENTION_INLINE_THRESHOLD,
	PDF_MAX_PAGES_PER_READ,
	parsePDFPageRange,
	renderPdfPagesToImageBlocks,
} from "../../utils/pdf.ts";
import type { ToolDefinition, ToolRenderResultOptions } from "../extensions/types.ts";
import { resolveReadPathAsync, resolveToCwd } from "./path-utils.ts";
import { getTextOutput, renderToolPath, replaceTabs, str } from "./render-utils.ts";
import { wrapToolDefinition } from "./tool-definition-wrapper.ts";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, type TruncationResult, truncateHead } from "./truncate.ts";

const readSchema = Type.Object({
	path: Type.String({ description: "Path to the file to read (relative or absolute)" }),
	offset: Type.Optional(Type.Number({ description: "Line number to start reading from (1-indexed)" })),
	limit: Type.Optional(Type.Number({ description: "Maximum number of lines to read" })),
	pages: Type.Optional(
		Type.String({
			description: `Page range for PDF files (for example "1-5", "3", or "10-20"). Maximum ${PDF_MAX_PAGES_PER_READ} pages per request.`,
		}),
	),
	region: Type.Optional(
		Type.Object({
			left: Type.Number({ description: "Left edge of the crop region in original image pixels", minimum: 0 }),
			top: Type.Number({ description: "Top edge of the crop region in original image pixels", minimum: 0 }),
			width: Type.Number({ description: "Width of the crop region in pixels", exclusiveMinimum: 0 }),
			height: Type.Number({ description: "Height of the crop region in pixels", exclusiveMinimum: 0 }),
		}),
	),
	regionNorm: Type.Optional(
		Type.Object({
			left: Type.Number({
				description: "Left edge of the crop region as a normalized fraction of width",
				minimum: 0,
				maximum: 1,
			}),
			top: Type.Number({
				description: "Top edge of the crop region as a normalized fraction of height",
				minimum: 0,
				maximum: 1,
			}),
			width: Type.Number({
				description: "Width of the crop region as a normalized fraction of width",
				exclusiveMinimum: 0,
				maximum: 1,
			}),
			height: Type.Number({
				description: "Height of the crop region as a normalized fraction of height",
				exclusiveMinimum: 0,
				maximum: 1,
			}),
		}),
	),
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

interface CompactReadClassification {
	kind: "docs" | "resource" | "skill";
	label: string;
}

const COMPACT_RESOURCE_FILE_NAMES = new Set(["AGENTS.md", "AGENTS.MD", "CLAUDE.md", "CLAUDE.MD"]);

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

export interface NormalizedReadRegion {
	left: number;
	top: number;
	width: number;
	height: number;
}

type ReadRenderArgs = {
	path?: string;
	file_path?: string;
	offset?: number;
	limit?: number;
	pages?: string;
	region?: ImageCropRegion;
	regionNorm?: NormalizedReadRegion;
};

function formatReadLineRange(args: ReadRenderArgs | undefined, theme: Theme): string {
	if (args?.offset === undefined && args?.limit === undefined) return "";
	const startLine = args.offset ?? 1;
	const endLine = args.limit !== undefined ? startLine + args.limit - 1 : "";
	return theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
}

function formatReadCall(args: ReadRenderArgs | undefined, theme: Theme, cwd: string): string {
	const pathDisplay = renderToolPath(str(args?.file_path ?? args?.path), theme, cwd);
	let suffix = formatReadLineRange(args, theme);
	if (args?.pages) {
		suffix += theme.fg("warning", ` pages=${args.pages}`);
	}
	if (args?.region) {
		suffix += theme.fg(
			"warning",
			` region=${args.region.left},${args.region.top},${args.region.width}x${args.region.height}`,
		);
	}
	if (args?.regionNorm) {
		suffix += theme.fg(
			"warning",
			` regionNorm=${args.regionNorm.left},${args.regionNorm.top},${args.regionNorm.width}x${args.regionNorm.height}`,
		);
	}
	return `${theme.fg("toolTitle", theme.bold("read"))} ${pathDisplay}${suffix}`;
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

function normalizeReadNormalizedRegion(region: NormalizedReadRegion | undefined): NormalizedReadRegion | undefined {
	if (!region) {
		return undefined;
	}
	if (
		!Number.isFinite(region.left) ||
		!Number.isFinite(region.top) ||
		!Number.isFinite(region.width) ||
		!Number.isFinite(region.height)
	) {
		throw new Error("Invalid regionNorm parameter. Use finite numbers for left, top, width, and height.");
	}
	if (
		region.left < 0 ||
		region.top < 0 ||
		region.width <= 0 ||
		region.height <= 0 ||
		region.left > 1 ||
		region.top > 1 ||
		region.width > 1 ||
		region.height > 1
	) {
		throw new Error(
			"Invalid regionNorm parameter. left/top/width/height must be within 0..1 and width/height must be > 0.",
		);
	}
	return region;
}

function resolveNormalizedCropRegion(
	region: NormalizedReadRegion,
	imageWidth: number,
	imageHeight: number,
): ImageCropRegion {
	return {
		left: region.left * imageWidth,
		top: region.top * imageHeight,
		width: region.width * imageWidth,
		height: region.height * imageHeight,
	};
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
	const previousRange = firstPage > 1 ? formatPageRange(Math.max(1, firstPage - rangeSize), firstPage - 1) : undefined;
	if (pageCount === null || pageCount === undefined) {
		return {
			rangeSize,
			previousRange,
			nextRange: formatPageRange(lastPage + 1, lastPage + rangeSize),
		};
	}

	const nextRange =
		lastPage < pageCount ? formatPageRange(lastPage + 1, Math.min(pageCount, lastPage + rangeSize)) : undefined;
	return { rangeSize, previousRange, nextRange };
}

function buildPdfReadNote(
	firstPage: number,
	lastPage: number,
	pageCount: number | null | undefined,
	navigation: { previousRange?: string; nextRange?: string },
	options?: { autoSelectedFirstRange?: boolean; totalUnavailable?: boolean },
): string {
	const range = firstPage === lastPage ? `page ${firstPage}` : `pages ${firstPage}-${lastPage}`;
	const previousGuidance = navigation.previousRange ? ` Use pages="prev" to revisit ${navigation.previousRange}.` : "";
	if (pageCount !== null && pageCount !== undefined) {
		const autoSelectedNote = options?.autoSelectedFirstRange ? " Auto-selected first range." : "";
		return navigation.nextRange
			? `Showing PDF ${range} of ${pageCount}.${autoSelectedNote} Use pages="next" or pages="${navigation.nextRange}" to continue.${previousGuidance}`
			: `Showing PDF ${range} of ${pageCount}.${autoSelectedNote}${previousGuidance}`;
	}
	const unavailableNote = options?.totalUnavailable ? " Total page count unavailable." : "";
	const autoSelectedNote = options?.autoSelectedFirstRange ? " Auto-selected first range." : "";
	return navigation.nextRange
		? `Showing PDF ${range}.${unavailableNote}${autoSelectedNote} Use pages="next" or pages="${navigation.nextRange}" to continue.${previousGuidance}`
		: `Showing PDF ${range}.${unavailableNote}${autoSelectedNote}${previousGuidance}`;
}

function buildPdfPartialReadNote(
	firstPage: number,
	lastPage: number,
	pageCount: number | null | undefined,
	requestedPageCount: number,
	renderedPageCount: number,
	navigation: { previousRange?: string; nextRange?: string },
): string {
	const range = firstPage === lastPage ? `page ${firstPage}` : `pages ${firstPage}-${lastPage}`;
	const totalSuffix = pageCount !== null && pageCount !== undefined ? ` of ${pageCount}` : "";
	const continueSuffix = navigation.nextRange
		? ` Use pages="next" or pages="${navigation.nextRange}" to continue.`
		: "";
	const previousSuffix = navigation.previousRange ? ` Use pages="prev" to revisit ${navigation.previousRange}.` : "";
	return `Prepared ${renderedPageCount} of ${requestedPageCount} requested PDF ${range}${totalSuffix}.${continueSuffix}${previousSuffix}`;
}

function buildPdfCropGuidance(firstPage: number, lastPage: number): string {
	if (firstPage === lastPage) {
		return `[To inspect a smaller area, re-read this page with pages="${firstPage}" and region={left,top,width,height} or regionNorm={left,top,width,height}.]`;
	}
	return '[To inspect a smaller area, re-read one page with pages="N" and region={left,top,width,height} or regionNorm={left,top,width,height}.]';
}

function buildImageCropGuidance(): string {
	return "[To inspect a smaller area, re-read this image with region={left,top,width,height} or regionNorm={left,top,width,height}.]";
}

async function prepareInlineImageBlock(
	image: ImageContent,
	options: {
		autoResize: boolean;
		region?: ImageCropRegion;
		regionNorm?: NormalizedReadRegion;
		includeDimensionNote?: boolean;
	},
): Promise<{ block?: ImageContent; dimensionNote?: string }> {
	let knownDimensions: { width: number; height: number } | null | undefined;
	let resolvedCrop: ImageCropRegion | undefined;
	const normalized = await processImage(Buffer.from(image.data, "base64"), image.mimeType, {
		autoResizeImages: false,
	});
	if (!normalized.ok) {
		throw new Error(normalized.message);
	}
	const normalizedImage: ImageContent = {
		type: "image",
		data: normalized.data,
		mimeType: normalized.mimeType,
	};
	const inputBytes = Buffer.from(normalized.data, "base64");
	if (options.region) {
		knownDimensions = await getImageDimensions(inputBytes);
		if (!knownDimensions) {
			throw new Error("Image processing failed while preparing the requested crop.");
		}
		resolvedCrop = options.region;
		if (!clipImageCropRegion(resolvedCrop, knownDimensions.width, knownDimensions.height)) {
			throw new Error("The requested region does not overlap the image bounds.");
		}
	} else if (options.regionNorm) {
		knownDimensions = await getImageDimensions(inputBytes);
		if (!knownDimensions) {
			throw new Error("Image processing failed while preparing the requested crop.");
		}
		resolvedCrop = resolveNormalizedCropRegion(options.regionNorm, knownDimensions.width, knownDimensions.height);
		if (!clipImageCropRegion(resolvedCrop, knownDimensions.width, knownDimensions.height)) {
			throw new Error("The requested region does not overlap the image bounds.");
		}
	}

	if (!options.autoResize && !resolvedCrop) {
		return { block: normalizedImage };
	}

	const resized = await resizeImage(
		inputBytes,
		normalizedImage.mimeType,
		resolvedCrop ? { crop: resolvedCrop } : undefined,
	);
	if (!resized) {
		const fallbackDimensions = knownDimensions ?? (await getImageDimensions(inputBytes));
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

function toPosixPath(filePath: string): string {
	return filePath.split(sep).join("/");
}

function getPiDocsClassification(absolutePath: string): CompactReadClassification | undefined {
	const packageRoot = dirname(getReadmePath());
	const relativePath = relative(resolvePath(packageRoot), resolvePath(absolutePath));
	if (
		relativePath === "" ||
		relativePath === ".." ||
		relativePath.startsWith(`..${sep}`) ||
		isAbsolute(relativePath)
	) {
		return undefined;
	}

	const label = toPosixPath(relativePath);
	if (label === "README.md" || label.startsWith("docs/") || label.startsWith("examples/")) {
		return { kind: "docs", label };
	}
	return undefined;
}

function getCompactReadClassification(
	args: ReadRenderArgs | undefined,
	cwd: string,
): CompactReadClassification | undefined {
	const rawPath = str(args?.file_path ?? args?.path);
	if (!rawPath) return undefined;

	const absolutePath = resolveToCwd(rawPath, cwd);
	const fileName = basename(absolutePath);
	if (fileName === "SKILL.md") {
		return { kind: "skill", label: basename(dirname(absolutePath)) || fileName };
	}

	const docsClassification = getPiDocsClassification(absolutePath);
	if (docsClassification) return docsClassification;

	if (COMPACT_RESOURCE_FILE_NAMES.has(fileName)) {
		return { kind: "resource", label: formatPathRelativeToCwdOrAbsolute(absolutePath, cwd) };
	}

	return undefined;
}

function formatCompactReadCall(
	classification: CompactReadClassification,
	args: ReadRenderArgs | undefined,
	theme: Theme,
): string {
	const expandHint = theme.fg("dim", ` (${keyText("app.tools.expand")} to expand)`);
	if (classification.kind === "skill") {
		return (
			theme.fg("customMessageLabel", `\x1b[1m[skill]\x1b[22m `) +
			theme.fg("customMessageText", classification.label) +
			formatReadLineRange(args, theme) +
			expandHint
		);
	}

	return (
		theme.fg("toolTitle", theme.bold(`read ${classification.kind}`)) +
		" " +
		theme.fg("accent", classification.label) +
		formatReadLineRange(args, theme) +
		expandHint
	);
}

function formatReadResult(
	args: ReadRenderArgs | undefined,
	result: { content: PromptContentBlock[]; details?: ReadToolDetails },
	options: ToolRenderResultOptions,
	theme: Theme,
	showImages: boolean,
	_cwd: string,
	isError: boolean,
): string {
	if (!options.expanded && !isError) {
		return "";
	}

	const rawPath = str(args?.file_path ?? args?.path);
	const output = getTextOutput(result, showImages);
	const lang = rawPath ? getLanguageFromPath(rawPath) : undefined;
	const renderedLines = lang ? highlightCode(replaceTabs(output), lang) : output.split("\n");
	const lines = trimTrailingEmptyLines(renderedLines);
	const maxLines = options.expanded ? lines.length : 10;
	const displayLines = lines.slice(0, maxLines);
	const remaining = lines.length - maxLines;
	let text = `\n${displayLines.map((line) => (lang ? replaceTabs(line) : theme.fg("toolOutput", replaceTabs(line)))).join("\n")}`;
	if (remaining > 0) {
		text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")}${theme.fg("muted", ")")}`;
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
		description: `Read the contents of a file. Supports text files, images (jpg, png, gif, webp, bmp), and PDFs. Images and rendered PDF pages are sent as attachments. For text files, output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large text files, pages for large PDFs, and region or regionNorm for image/PDF crops.`,
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
				regionNorm,
			}: {
				path: string;
				offset?: number;
				limit?: number;
				pages?: string;
				region?: ImageCropRegion;
				regionNorm?: NormalizedReadRegion;
			},
			signal?: AbortSignal,
			_onUpdate?,
			ctx?,
		) {
			if (region && regionNorm) {
				throw new Error("Use either region or regionNorm, not both.");
			}
			const requestedRegion = normalizeReadRegion(region);
			const requestedNormalizedRegion = normalizeReadNormalizedRegion(regionNorm);
			return new Promise<{ content: (TextContent | ImageContent)[]; details: ReadToolDetails | undefined }>(
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
							const absolutePath = await resolveReadPathAsync(path, cwd);
							if (aborted) return;
							// Check if file exists and is readable.
							await ops.access(absolutePath);
							if (aborted) return;
							const mimeType = ops.detectImageMimeType ? await ops.detectImageMimeType(absolutePath) : undefined;
							let content: (TextContent | ImageContent)[];
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

								if (requestedRegion || requestedNormalizedRegion) {
									if (
										!Number.isFinite(effectiveRange.lastPage) ||
										effectiveRange.firstPage !== effectiveRange.lastPage
									) {
										throw new Error('PDF region reads require exactly one page. Use pages="N".');
									}
								}

								const needsDetailedPageProcessing =
									requestedRegion !== undefined ||
									requestedNormalizedRegion !== undefined ||
									effectiveRange.firstPage === effectiveRange.lastPage;
								let imageBlocks: ImageContent[] = [];
								let dimensionNote: string | undefined;

								if (needsDetailedPageProcessing) {
									const rawBlocks = await renderPdfPagesToImageBlocks(absolutePath, {
										firstPage: effectiveRange.firstPage,
										lastPage: effectiveRange.lastPage,
										pageCount,
										autoResize: false,
										signal,
										mtimeMs: fileStats.mtimeMs,
									});

									for (const rawBlock of rawBlocks) {
										const preparedBlock = await prepareInlineImageBlock(rawBlock, {
											autoResize: autoResizeImages,
											region: requestedRegion,
											regionNorm: requestedNormalizedRegion,
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
										pageCount,
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
								if (autoResizeImages || requestedRegion || requestedNormalizedRegion) {
									const preparedBlock = await prepareInlineImageBlock(
										{ type: "image", data: base64, mimeType },
										{
											autoResize: autoResizeImages,
											region: requestedRegion,
											regionNorm: requestedNormalizedRegion,
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
								if (requestedRegion || requestedNormalizedRegion) {
									throw new Error("The region and regionNorm parameters are only valid for images and PDFs.");
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
			const classification = !context.expanded ? getCompactReadClassification(args, context.cwd) : undefined;
			text.setText(
				classification
					? formatCompactReadCall(classification, args, theme)
					: formatReadCall(args, theme, context.cwd),
			);
			return text;
		},
		renderResult(result, options, theme, context) {
			const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
			text.setText(
				formatReadResult(context.args, result, options, theme, context.showImages, context.cwd, context.isError),
			);
			return text;
		},
	};
}

export function createReadTool(cwd: string, options?: ReadToolOptions): AgentTool<typeof readSchema> {
	return wrapToolDefinition(createReadToolDefinition(cwd, options));
}
