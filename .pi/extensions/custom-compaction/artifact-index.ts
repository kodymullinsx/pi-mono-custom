export type TrackedToolName = "bash" | "read" | "grep";

export interface ToolExecutionStartLike {
	toolCallId: string;
	toolName: string;
	args: unknown;
}

export interface ToolExecutionEndLike {
	toolCallId: string;
	toolName: string;
	result: unknown;
	isError: boolean;
}

export interface ArtifactIndexOptions {
	maxEntries: number;
	maxPreviewChars: number;
}

export interface StartedToolCall {
	toolCallId: string;
	toolName: TrackedToolName;
	args: Record<string, unknown>;
	timestamp: number;
}

export interface TruncationSummary {
	truncatedBy?: string;
	outputLines?: number;
	totalLines?: number;
	maxLines?: number;
	maxBytes?: number;
	firstLineExceedsLimit?: boolean;
}

export interface ArtifactObservation {
	toolCallId: string;
	toolName: TrackedToolName;
	timestamp: number;
	args: Record<string, unknown>;
	isError: boolean;
	note: string;
	previewText?: string;
	fullOutputPath?: string;
	truncation?: TruncationSummary;
	matchLimitReached?: number;
	linesTruncated?: boolean;
}

export interface ArtifactDetailsSnapshot {
	version: 1;
	artifacts: ArtifactObservation[];
}

export interface ArtifactIndexState {
	startedCalls: Map<string, StartedToolCall>;
	observations: ArtifactObservation[];
}

const TRACKED_TOOLS = new Set<TrackedToolName>(["bash", "read", "grep"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asTrackedToolName(toolName: string): TrackedToolName | undefined {
	return TRACKED_TOOLS.has(toolName as TrackedToolName) ? (toolName as TrackedToolName) : undefined;
}

function normalizeArgs(toolName: TrackedToolName, args: unknown): Record<string, unknown> {
	if (!isRecord(args)) return {};
	const keys =
		toolName === "bash"
			? ["command", "timeout"]
			: toolName === "read"
				? ["path", "offset", "limit"]
				: ["pattern", "path", "glob", "context", "limit", "ignoreCase", "literal"];
	const normalized: Record<string, unknown> = {};
	for (const key of keys) {
		if (key in args) normalized[key] = args[key];
	}
	return normalized;
}

function extractPreviewText(result: unknown, maxPreviewChars: number): string | undefined {
	if (!isRecord(result) || !Array.isArray(result.content)) return undefined;
	const text = result.content
		.filter((item): item is { type: string; text?: string } => isRecord(item) && typeof item.type === "string")
		.filter((item) => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text!.trim())
		.filter(Boolean)
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();

	if (!text) return undefined;
	if (text.length <= maxPreviewChars) return text;
	return `${text.slice(0, Math.max(0, maxPreviewChars - 1)).trimEnd()}…`;
}

function normalizeTruncation(value: unknown): TruncationSummary | undefined {
	if (!isRecord(value)) return undefined;
	const truncation: TruncationSummary = {};
	if (typeof value.truncatedBy === "string") truncation.truncatedBy = value.truncatedBy;
	if (typeof value.outputLines === "number") truncation.outputLines = value.outputLines;
	if (typeof value.totalLines === "number") truncation.totalLines = value.totalLines;
	if (typeof value.maxLines === "number") truncation.maxLines = value.maxLines;
	if (typeof value.maxBytes === "number") truncation.maxBytes = value.maxBytes;
	if (value.firstLineExceedsLimit === true) truncation.firstLineExceedsLimit = true;
	return Object.keys(truncation).length > 0 ? truncation : undefined;
}

function formatArgTarget(toolName: TrackedToolName, args: Record<string, unknown>): string {
	if (toolName === "bash") {
		const command = typeof args.command === "string" ? args.command.trim().replace(/\s+/g, " ") : "";
		if (!command) return "bash command";
		return `bash \`${command.slice(0, 80)}${command.length > 80 ? "…" : ""}\``;
	}
	if (toolName === "read") {
		const target = typeof args.path === "string" ? args.path : "read";
		const offset = typeof args.offset === "number" ? ` offset=${args.offset}` : "";
		const limit = typeof args.limit === "number" ? ` limit=${args.limit}` : "";
		return `read ${target}${offset}${limit}`;
	}
	const pattern = typeof args.pattern === "string" ? args.pattern : "pattern";
	const target = typeof args.path === "string" ? ` path=${args.path}` : "";
	return `grep "${pattern.slice(0, 40)}${pattern.length > 40 ? "…" : ""}"${target}`;
}

function describeTruncation(truncation: TruncationSummary | undefined): string | undefined {
	if (!truncation) return undefined;
	if (truncation.firstLineExceedsLimit) return "first line exceeded byte limit";
	if (truncation.truncatedBy === "lines" && truncation.outputLines !== undefined && truncation.totalLines !== undefined) {
		return `showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
	}
	if (truncation.truncatedBy === "bytes" && truncation.maxBytes !== undefined) {
		return `truncated at ${truncation.maxBytes} bytes`;
	}
	if (truncation.truncatedBy) return `truncated by ${truncation.truncatedBy}`;
	return "truncated";
}

function buildObservationNote(
	toolName: TrackedToolName,
	args: Record<string, unknown>,
	truncation: TruncationSummary | undefined,
	fullOutputPath: string | undefined,
	matchLimitReached: number | undefined,
	linesTruncated: boolean | undefined,
	isError: boolean,
): string {
	const parts = [formatArgTarget(toolName, args)];
	const truncationNote = describeTruncation(truncation);
	if (truncationNote) parts.push(truncationNote);
	if (typeof matchLimitReached === "number") parts.push(`match limit reached (${matchLimitReached})`);
	if (linesTruncated) parts.push("long lines were truncated");
	if (fullOutputPath) parts.push("full output path available");
	if (isError) parts.push("tool ended with error");
	return parts.join(": ");
}

function createObservationKey(observation: ArtifactObservation): string {
	return `${observation.toolName}:${observation.toolCallId}:${observation.timestamp}`;
}

function mergeObservation(state: ArtifactIndexState, observation: ArtifactObservation, maxEntries: number): void {
	const existing = new Set(state.observations.map(createObservationKey));
	if (!existing.has(createObservationKey(observation))) {
		state.observations.push(observation);
	}
	if (state.observations.length > maxEntries) {
		state.observations.splice(0, state.observations.length - maxEntries);
	}
}

function normalizeObservation(value: unknown): ArtifactObservation | undefined {
	if (!isRecord(value)) return undefined;
	const toolName = typeof value.toolName === "string" ? asTrackedToolName(value.toolName) : undefined;
	if (!toolName || typeof value.toolCallId !== "string" || typeof value.timestamp !== "number" || typeof value.note !== "string") {
		return undefined;
	}
	return {
		toolCallId: value.toolCallId,
		toolName,
		timestamp: value.timestamp,
		args: isRecord(value.args) ? value.args : {},
		isError: value.isError === true,
		note: value.note,
		previewText: typeof value.previewText === "string" ? value.previewText : undefined,
		fullOutputPath: typeof value.fullOutputPath === "string" ? value.fullOutputPath : undefined,
		truncation: normalizeTruncation(value.truncation),
		matchLimitReached: typeof value.matchLimitReached === "number" ? value.matchLimitReached : undefined,
		linesTruncated: value.linesTruncated === true,
	};
}

export function createArtifactIndexState(): ArtifactIndexState {
	return {
		startedCalls: new Map(),
		observations: [],
	};
}

export function clearArtifactIndexState(state: ArtifactIndexState): void {
	state.startedCalls.clear();
	state.observations = [];
}

export function rememberToolExecutionStart(state: ArtifactIndexState, event: ToolExecutionStartLike): void {
	const toolName = asTrackedToolName(event.toolName);
	if (!toolName) return;
	state.startedCalls.set(event.toolCallId, {
		toolCallId: event.toolCallId,
		toolName,
		args: normalizeArgs(toolName, event.args),
		timestamp: Date.now(),
	});
}

export function recordToolExecutionEnd(
	state: ArtifactIndexState,
	event: ToolExecutionEndLike,
	options: ArtifactIndexOptions,
): ArtifactObservation | undefined {
	const toolName = asTrackedToolName(event.toolName);
	if (!toolName) return undefined;
	const started = state.startedCalls.get(event.toolCallId);
	state.startedCalls.delete(event.toolCallId);

	const result = isRecord(event.result) ? event.result : {};
	const details = isRecord(result.details) ? result.details : {};
	const truncation = normalizeTruncation(details.truncation);
	const fullOutputPath = typeof details.fullOutputPath === "string" ? details.fullOutputPath : undefined;
	const matchLimitReached = typeof details.matchLimitReached === "number" ? details.matchLimitReached : undefined;
	const linesTruncated = details.linesTruncated === true;
	const relevant = Boolean(truncation) || Boolean(fullOutputPath) || typeof matchLimitReached === "number" || linesTruncated;
	if (!relevant) return undefined;

	const args = started?.args ?? {};
	const observation: ArtifactObservation = {
		toolCallId: event.toolCallId,
		toolName,
		timestamp: started?.timestamp ?? Date.now(),
		args,
		isError: event.isError,
		note: buildObservationNote(toolName, args, truncation, fullOutputPath, matchLimitReached, linesTruncated, event.isError),
		previewText: extractPreviewText(result, options.maxPreviewChars),
		fullOutputPath,
		truncation,
		matchLimitReached,
		linesTruncated,
	};
	mergeObservation(state, observation, options.maxEntries);
	return observation;
}

export function getRecentArtifactObservations(state: ArtifactIndexState, limit: number): ArtifactObservation[] {
	if (limit <= 0) return [];
	return state.observations.slice(-limit);
}

export function buildArtifactDetails(state: ArtifactIndexState): ArtifactDetailsSnapshot | undefined {
	if (state.observations.length === 0) return undefined;
	return {
		version: 1,
		artifacts: [...state.observations],
	};
}

export function hydrateArtifactIndexFromBranchEntries(
	state: ArtifactIndexState,
	branchEntries: unknown[],
	options: ArtifactIndexOptions,
): void {
	for (const entry of branchEntries) {
		if (!isRecord(entry) || entry.type !== "compaction" || !isRecord(entry.details) || entry.details.version !== 1) continue;
		const artifacts = Array.isArray(entry.details.artifacts) ? entry.details.artifacts : [];
		for (const artifact of artifacts) {
			const normalized = normalizeObservation(artifact);
			if (normalized) mergeObservation(state, normalized, options.maxEntries);
		}
	}
}
