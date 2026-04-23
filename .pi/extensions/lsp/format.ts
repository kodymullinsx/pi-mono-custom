import fs from "node:fs/promises";
import path from "node:path";
import { fromDocumentUri, type LspOperation } from "./runtime.ts";

export interface NormalizedLocation {
	uri: string;
	path: string;
	line: number;
	column: number;
	endLine: number;
	endColumn: number;
}

export interface LocationResultDetails {
	kind: "locations";
	operation: LspOperation;
	language: string;
	sourcePath: string;
	filteredCount: number;
	filterAbandoned?: boolean;
	filterWarning?: string;
	previewReadFailures?: number;
	malformedResultCount?: number;
	responseWarnings?: string[];
	unsupportedResponse?: boolean;
	locations: Array<NormalizedLocation & { preview?: string }>;
}

export interface HoverResultDetails {
	kind: "hover";
	operation: LspOperation;
	language: string;
	sourcePath: string;
	contents: string;
	malformedResultCount?: number;
	responseWarnings?: string[];
	unsupportedResponse?: boolean;
	range?: {
		line: number;
		column: number;
		endLine: number;
		endColumn: number;
	};
}

export interface NormalizedSymbol {
	name: string;
	kind: number;
	kindName: string;
	detail?: string;
	line: number;
	column: number;
	endLine: number;
	endColumn: number;
	selectionLine: number;
	selectionColumn: number;
	containerName?: string;
	children: NormalizedSymbol[];
}

export interface DocumentSymbolResultDetails {
	kind: "documentSymbols";
	operation: LspOperation;
	language: string;
	sourcePath: string;
	malformedResultCount?: number;
	responseWarnings?: string[];
	unsupportedResponse?: boolean;
	symbols: NormalizedSymbol[];
}

export type FormattedDetails = LocationResultDetails | HoverResultDetails | DocumentSymbolResultDetails;

export interface RenderedResult<TDetails extends FormattedDetails> {
	text: string;
	details: TDetails;
}

const SYMBOL_KIND_NAMES: Record<number, string> = {
	1: "File",
	2: "Module",
	3: "Namespace",
	4: "Package",
	5: "Class",
	6: "Method",
	7: "Property",
	8: "Field",
	9: "Constructor",
	10: "Enum",
	11: "Interface",
	12: "Function",
	13: "Variable",
	14: "Constant",
	15: "String",
	16: "Number",
	17: "Boolean",
	18: "Array",
	19: "Object",
	20: "Key",
	21: "Null",
	22: "EnumMember",
	23: "Struct",
	24: "Event",
	25: "Operator",
	26: "TypeParameter",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
	if (value === null || value === undefined) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
}

function isLocationLike(value: unknown): value is { uri: string; range: Record<string, unknown> } {
	return isRecord(value) && typeof value.uri === "string" && isRecord(value.range);
}

function isLocationLinkLike(value: unknown): value is {
	targetUri: string;
	targetSelectionRange?: Record<string, unknown>;
	targetRange?: Record<string, unknown>;
} {
	return isRecord(value) && typeof value.targetUri === "string";
}

function normalizeRange(range: unknown): { line: number; column: number; endLine: number; endColumn: number } | undefined {
	if (!isRecord(range) || !isRecord(range.start) || !isRecord(range.end)) {
		return undefined;
	}

	const startLine = typeof range.start.line === "number" ? range.start.line : undefined;
	const startCharacter = typeof range.start.character === "number" ? range.start.character : undefined;
	const endLine = typeof range.end.line === "number" ? range.end.line : undefined;
	const endCharacter = typeof range.end.character === "number" ? range.end.character : undefined;
	if (
		startLine === undefined ||
		startCharacter === undefined ||
		endLine === undefined ||
		endCharacter === undefined
	) {
		return undefined;
	}

	return {
		line: startLine + 1,
		column: startCharacter + 1,
		endLine: endLine + 1,
		endColumn: endCharacter + 1,
	};
}

function uriToDisplayPath(uri: string): string {
	return fromDocumentUri(uri) ?? uri;
}

interface LocationPreviewResult {
	preview?: string;
	readFailed: boolean;
}

interface NormalizedCollectionResult<T> {
	items: T[];
	malformedCount: number;
	unsupportedResponse: boolean;
}

interface NormalizedMarkedStringResult {
	text: string;
	malformed: boolean;
}

export interface NormalizedHoverResult {
	contents: HoverResultDetails["contents"] | null;
	range?: HoverResultDetails["range"];
	malformedCount: number;
	unsupportedResponse: boolean;
}

async function readPreviewLine(filePath: string, lineNumber: number): Promise<LocationPreviewResult> {
	if (!path.isAbsolute(filePath)) {
		return { readFailed: false };
	}
	try {
		const text = await fs.readFile(filePath, "utf8");
		const line = text.split(/\r?\n/)[lineNumber - 1];
		if (!line) {
			return { readFailed: false };
		}
		const normalized = line.trim().replace(/\s+/g, " ");
		return { preview: normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized, readFailed: false };
	} catch {
		return { readFailed: true };
	}
}

function formatOperationLabel(operation: LspOperation): string {
	switch (operation) {
		case "goToDefinition":
			return "Definition";
		case "findReferences":
			return "References";
		case "hover":
			return "Hover";
		case "documentSymbol":
			return "Document Symbols";
		case "goToImplementation":
			return "Implementation";
	}
}

function kindName(kind: number): string {
	return SYMBOL_KIND_NAMES[kind] ?? `Kind ${kind}`;
}

function buildMalformedWarning(kind: string, count: number): string {
	return `Language server returned ${count} malformed ${kind} result(s).`;
}

export function analyzeLocations(raw: unknown): NormalizedCollectionResult<NormalizedLocation> {
	const normalized: NormalizedLocation[] = [];
	let malformedCount = 0;
	if (raw === null || raw === undefined) {
		return { items: normalized, malformedCount, unsupportedResponse: false };
	}
	const values = asArray(raw);
	for (const value of values) {
		if (isLocationLinkLike(value)) {
			const range = normalizeRange(value.targetSelectionRange ?? value.targetRange);
			if (!range) {
				malformedCount += 1;
				continue;
			}
			normalized.push({
				uri: value.targetUri,
				path: uriToDisplayPath(value.targetUri),
				...range,
			});
			continue;
		}

		if (isLocationLike(value)) {
			const range = normalizeRange(value.range);
			if (!range) {
				malformedCount += 1;
				continue;
			}
			normalized.push({
				uri: value.uri,
				path: uriToDisplayPath(value.uri),
				...range,
			});
			continue;
		}
		malformedCount += 1;
	}

	return {
		items: normalized,
		malformedCount,
		unsupportedResponse: values.length > 0 && normalized.length === 0 && malformedCount > 0,
	};
}

export function normalizeLocations(raw: unknown): NormalizedLocation[] {
	return analyzeLocations(raw).items;
}

function normalizeMarkedString(value: unknown): NormalizedMarkedStringResult {
	if (typeof value === "string") {
		return { text: value, malformed: false };
	}
	if (!isRecord(value)) {
		return { text: "", malformed: true };
	}
	if (typeof value.value === "string" && typeof value.language === "string") {
		return { text: `\`\`\`${value.language}\n${value.value}\n\`\`\``, malformed: false };
	}
	if (typeof value.kind === "string" && typeof value.value === "string") {
		return { text: value.value, malformed: false };
	}
	return { text: "", malformed: true };
}

export function analyzeHover(raw: unknown): NormalizedHoverResult {
	if (raw === null || raw === undefined) {
		return { contents: null, malformedCount: 0, unsupportedResponse: false };
	}
	if (!isRecord(raw)) {
		return { contents: null, malformedCount: 1, unsupportedResponse: true };
	}

	const range = normalizeRange(raw.range);
	const contents = raw.contents;
	if (contents === null || contents === undefined) {
		return { contents: null, range, malformedCount: 0, unsupportedResponse: false };
	}

	if (Array.isArray(contents)) {
		let malformedCount = 0;
		const parts = contents.flatMap((item) => {
			const normalized = normalizeMarkedString(item);
			if (!normalized.text && normalized.malformed) {
				malformedCount += 1;
			}
			return normalized.text ? [normalized.text] : [];
		});
		return {
			contents: parts.length > 0 ? parts.join("\n\n") : null,
			range,
			malformedCount,
			unsupportedResponse: parts.length === 0 && malformedCount > 0,
		};
	}

	const single = normalizeMarkedString(contents);
	return {
		contents: single.text || null,
		range,
		malformedCount: single.malformed ? 1 : 0,
		unsupportedResponse: !single.text && single.malformed,
	};
}

export function normalizeHover(raw: unknown): HoverResultDetails["contents"] | null {
	return analyzeHover(raw).contents;
}

function normalizeDocumentSymbolNode(raw: unknown): NormalizedSymbol | undefined {
	if (!isRecord(raw) || typeof raw.name !== "string" || typeof raw.kind !== "number") {
		return undefined;
	}

	if (isRecord(raw.selectionRange)) {
		const selectionRange = normalizeRange(raw.selectionRange);
		const range = normalizeRange(raw.range);
		if (!selectionRange || !range) {
			return undefined;
		}

		return {
			name: raw.name,
			kind: raw.kind,
			kindName: kindName(raw.kind),
			detail: typeof raw.detail === "string" ? raw.detail : undefined,
			line: range.line,
			column: range.column,
			endLine: range.endLine,
			endColumn: range.endColumn,
			selectionLine: selectionRange.line,
			selectionColumn: selectionRange.column,
			children: Array.isArray(raw.children)
				? raw.children.map((child) => normalizeDocumentSymbolNode(child)).filter((child): child is NormalizedSymbol => Boolean(child))
				: [],
		};
	}

	if (isRecord(raw.location)) {
		const locationRange = normalizeRange(raw.location.range);
		if (!locationRange) {
			return undefined;
		}

		return {
			name: raw.name,
			kind: raw.kind,
			kindName: kindName(raw.kind),
			detail: typeof raw.detail === "string" ? raw.detail : undefined,
			line: locationRange.line,
			column: locationRange.column,
			endLine: locationRange.endLine,
			endColumn: locationRange.endColumn,
			selectionLine: locationRange.line,
			selectionColumn: locationRange.column,
			containerName: typeof raw.containerName === "string" ? raw.containerName : undefined,
			children: [],
		};
	}

	return undefined;
}

export function analyzeDocumentSymbols(raw: unknown): NormalizedCollectionResult<NormalizedSymbol> {
	if (raw === null || raw === undefined) {
		return { items: [], malformedCount: 0, unsupportedResponse: false };
	}
	if (!Array.isArray(raw)) {
		return { items: [], malformedCount: 1, unsupportedResponse: true };
	}
	let malformedCount = 0;
	const symbols = raw.flatMap((item) => {
		const normalized = normalizeDocumentSymbolNode(item);
		if (!normalized) {
			malformedCount += 1;
			return [];
		}
		return [normalized];
	});
	return {
		items: symbols,
		malformedCount,
		unsupportedResponse: raw.length > 0 && symbols.length === 0 && malformedCount > 0,
	};
}

export function normalizeDocumentSymbols(raw: unknown): NormalizedSymbol[] {
	return analyzeDocumentSymbols(raw).items;
}

function renderLocationText(details: LocationResultDetails): string {
	const title = formatOperationLabel(details.operation);
	const warnings = [...(details.responseWarnings ?? [])];
	if (details.filteredCount > 0) {
		warnings.push(`${details.filteredCount} ignored path(s) were filtered out.`);
	}
	if (details.filterAbandoned) {
		warnings.push("Gitignore filtering was interrupted; some ignored paths may still be included.");
	}
	if (details.filterWarning) {
		warnings.push(details.filterWarning);
	}
	if (details.previewReadFailures) {
		warnings.push(`Unable to read preview text for ${details.previewReadFailures} location(s).`);
	}

	if (details.locations.length === 0) {
		const base = details.unsupportedResponse
			? `Language server returned an unsupported ${title.toLowerCase()} response for ${details.sourcePath}.`
			: `No ${title.toLowerCase()} results found for ${details.sourcePath}.`;
		return warnings.length === 0 ? base : [base, ...warnings.map((warning) => `Warning: ${warning}`)].join("\n");
	}

	const visibleLocations = details.locations.slice(0, 20);
	const lines = [`${title} results for ${details.sourcePath} (${details.locations.length})`];
	for (const location of visibleLocations) {
		const preview = location.preview ? ` - ${location.preview}` : "";
		lines.push(`- ${location.path}:${location.line}:${location.column}${preview}`);
	}
	if (details.locations.length > visibleLocations.length) {
		lines.push(`... ${details.locations.length - visibleLocations.length} more result(s) omitted from text output`);
	}
	for (const warning of warnings) {
		lines.push(`Warning: ${warning}`);
	}
	return lines.join("\n");
}

function renderHoverText(details: HoverResultDetails): string {
	const header = `Hover for ${details.sourcePath}`;
	const warnings = details.responseWarnings ?? [];
	if (!details.contents) {
		const base = details.unsupportedResponse
			? `Language server returned an unsupported hover response for ${details.sourcePath}.`
			: `${header}\n\nNo hover information was returned.`;
		return warnings.length === 0 ? base : [base, ...warnings.map((warning) => `Warning: ${warning}`)].join("\n");
	}
	const body = `${header}\n\n${details.contents}`;
	return warnings.length === 0 ? body : [body, ...warnings.map((warning) => `Warning: ${warning}`)].join("\n");
}

function renderSymbolLines(symbols: NormalizedSymbol[], indent = ""): string[] {
	const lines: string[] = [];
	for (const symbol of symbols) {
		const detail = symbol.detail ? ` - ${symbol.detail}` : "";
		lines.push(`${indent}- ${symbol.name} (${symbol.kindName}) @ ${symbol.selectionLine}:${symbol.selectionColumn}${detail}`);
		lines.push(...renderSymbolLines(symbol.children, `${indent}  `));
	}
	return lines;
}

function renderDocumentSymbolText(details: DocumentSymbolResultDetails): string {
	const warnings = details.responseWarnings ?? [];
	if (details.symbols.length === 0) {
		const base = details.unsupportedResponse
			? `Language server returned an unsupported document symbol response for ${details.sourcePath}.`
			: `No document symbols were returned for ${details.sourcePath}.`;
		return warnings.length === 0 ? base : [base, ...warnings.map((warning) => `Warning: ${warning}`)].join("\n");
	}
	return [`Document symbols for ${details.sourcePath}`, ...renderSymbolLines(details.symbols), ...warnings.map((warning) => `Warning: ${warning}`)].join(
		"\n",
	);
}

export async function renderLocationResult(args: {
	operation: LspOperation;
	language: string;
	sourcePath: string;
	locations: NormalizedLocation[];
	filteredCount?: number;
	filterAbandoned?: boolean;
	filterWarning?: string;
	malformedResultCount?: number;
	unsupportedResponse?: boolean;
}): Promise<RenderedResult<LocationResultDetails>> {
	const locationsWithPreview = await Promise.all(
		args.locations.map(async (location) => ({
			...location,
			...await readPreviewLine(location.path, location.line),
		})),
	);
	const previewReadFailures = locationsWithPreview.reduce((count, item) => count + (item.readFailed ? 1 : 0), 0);
	const responseWarnings = args.malformedResultCount
		? [buildMalformedWarning("location", args.malformedResultCount)]
		: undefined;

	const details: LocationResultDetails = {
		kind: "locations",
		operation: args.operation,
		language: args.language,
		sourcePath: args.sourcePath,
		filteredCount: args.filteredCount ?? 0,
		filterAbandoned: args.filterAbandoned,
		filterWarning: args.filterWarning,
		previewReadFailures,
		malformedResultCount: args.malformedResultCount,
		responseWarnings,
		unsupportedResponse: args.unsupportedResponse,
		locations: locationsWithPreview.map(({ readFailed, ...location }) => location),
	};

	return {
		text: renderLocationText(details),
		details,
	};
}

export function renderHoverResult(args: {
	operation: LspOperation;
	language: string;
	sourcePath: string;
	rawResult: unknown;
}): RenderedResult<HoverResultDetails> {
	const normalized = analyzeHover(args.rawResult);
	const responseWarnings = normalized.malformedCount ? [buildMalformedWarning("hover content item", normalized.malformedCount)] : undefined;
	const details: HoverResultDetails = {
		kind: "hover",
		operation: args.operation,
		language: args.language,
		sourcePath: args.sourcePath,
		contents: normalized.contents ?? "",
		range: normalized.range,
		malformedResultCount: normalized.malformedCount,
		responseWarnings,
		unsupportedResponse: normalized.unsupportedResponse,
	};

	return {
		text: renderHoverText(details),
		details,
	};
}

export function renderDocumentSymbolResult(args: {
	operation: LspOperation;
	language: string;
	sourcePath: string;
	rawResult: unknown;
}): RenderedResult<DocumentSymbolResultDetails> {
	const normalized = analyzeDocumentSymbols(args.rawResult);
	const responseWarnings = normalized.malformedCount
		? [buildMalformedWarning("document symbol", normalized.malformedCount)]
		: undefined;
	const details: DocumentSymbolResultDetails = {
		kind: "documentSymbols",
		operation: args.operation,
		language: args.language,
		sourcePath: args.sourcePath,
		malformedResultCount: normalized.malformedCount,
		responseWarnings,
		unsupportedResponse: normalized.unsupportedResponse,
		symbols: normalized.items,
	};

	return {
		text: renderDocumentSymbolText(details),
		details,
	};
}
