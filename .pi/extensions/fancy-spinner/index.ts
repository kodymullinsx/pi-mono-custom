import type {
	ExtensionAPI,
	ExtensionContext,
	MessageStartEvent,
	MessageUpdateEvent,
	ToolCallEvent,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
	ToolExecutionUpdateEvent,
} from "@mariozechner/pi-coding-agent";
import { describeToolCall, describeToolExecution, type ActivitySummary } from "./activity.ts";
import { getFlavorCount, getFlavorText, getMinimalFlavorText, type FlavorPhase } from "./copy.ts";

const STATUS_KEY = "fancy-spinner";
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DEFAULT_STALL_MS = 15_000;
const DEFAULT_TICK_MS = 120;
const DEFAULT_ROTATE_MS = 4_000;
const DEFAULT_WAVE_STEP_MS = 60;
const DEFAULT_WAVE_ROLE = "warning";
const DEFAULT_WAVE_SIGMA = 3.8;
const DEFAULT_WAVE_LERP_MAX = 0.37;
const DEFAULT_WAVE_PEAK_ROLE: string | undefined = "accent";
const WIDE_WIDTH = 72;
const MEDIUM_WIDTH = 48;
const ANSI_RESET = "\u001b[0m";
const DEFAULT_PI_ACCENT_RGB = { r: 255, g: 214, b: 10 } as const;
const WAVE_MIN_INTENSITY = 0.84;
const WAVE_MAX_INTENSITY = 1.08;
const WAVE_PADDING = 10;
const INVALID_CONFIG_WARNINGS = new Set<string>();
const RUNTIME_WARNINGS = new Set<string>();
const GRAPHEME_SEGMENTER =
	typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

type SpinnerPhase = "thinking" | "tool" | "responding";
type SpinnerSurface = "working-message" | "status";
type WidthMode = "wide" | "medium" | "narrow";
type SpinnerColorMode = "off" | "theme-wave";

interface SpinnerConfig {
	stallMs: number;
	tickMs: number;
	rotateMs: number;
	minimal: boolean;
	colorMode: SpinnerColorMode;
	waveStepMs: number;
	waveRole: string;
	wavePeakRole: string | undefined;
	waveLerpMax: number;
	waveSigma: number;
}

interface ActiveToolState {
	activity: ActivitySummary;
	startedAt: number;
	lastProgressAt: number;
}

interface RgbColor {
	r: number;
	g: number;
	b: number;
}

interface SpinnerState {
	active: boolean;
	runToken: number;
	timer: ReturnType<typeof setInterval> | null;
	startedAt: number;
	lastProgressAt: number;
	phase: SpinnerPhase;
	activeTools: Map<string, ActiveToolState>;
	flavorIndex: number;
	lastFlavorAt: number;
	lastFlavorPhase: FlavorPhase;
}

const config = loadConfig();

const state: SpinnerState = {
	active: false,
	runToken: 0,
	timer: null,
	startedAt: 0,
	lastProgressAt: 0,
	phase: "thinking",
	activeTools: new Map(),
	flavorIndex: 0,
	lastFlavorAt: 0,
	lastFlavorPhase: "thinking",
};

export default function fancySpinner(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		cleanup(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		cleanup(ctx);
	});

	pi.on("agent_start", async (_event, ctx) => {
		startRun(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		cleanup(ctx);
	});

	pi.on("turn_start", async (_event, ctx) => {
		if (!state.active) {
			return;
		}
		const now = Date.now();
		resetTurnState(now);
		renderSpinner(ctx, now);
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		handleToolExecutionStart(event, ctx);
	});

	pi.on("tool_call", async (event, ctx) => {
		handleToolCall(event, ctx);
	});

	pi.on("tool_execution_update", async (event, _ctx) => {
		handleToolExecutionUpdate(event);
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		handleToolExecutionEnd(event, ctx);
	});

	pi.on("message_start", async (event, ctx) => {
		handleAssistantProgress(event, ctx, true);
	});

	pi.on("message_update", async (event, ctx) => {
		handleAssistantProgress(event, ctx, false);
	});
}

function startRun(ctx: ExtensionContext): void {
	cleanup(ctx);

	const now = Date.now();
	state.active = true;
	state.runToken += 1;
	resetSpinnerState(now);
	seedFlavor(now, getFlavorPhase(now));

	if (!ctx.hasUI) {
		return;
	}

	const runToken = state.runToken;
	state.timer = setInterval(() => {
		if (!state.active || state.runToken !== runToken) {
			return;
		}
		renderSpinner(ctx);
	}, config.tickMs);

	renderSpinner(ctx, now);
}

function cleanup(ctx: ExtensionContext): void {
	if (state.timer) {
		clearInterval(state.timer);
		state.timer = null;
	}

	state.active = false;
	state.runToken += 1;
	resetSpinnerState(0);
	state.flavorIndex = 0;
	state.lastFlavorAt = 0;
	state.lastFlavorPhase = "thinking";

	if (ctx.hasUI) {
		clearSpinnerUi(ctx);
	}
}

function resetTurnState(now: number): void {
	state.phase = "thinking";
	state.lastProgressAt = now;
	state.activeTools.clear();
}

function resetSpinnerState(startedAt: number): void {
	state.startedAt = startedAt;
	state.lastProgressAt = startedAt;
	state.phase = "thinking";
	state.activeTools.clear();
}

function handleToolExecutionStart(event: ToolExecutionStartEvent, ctx: ExtensionContext): void {
	if (!state.active) {
		return;
	}

	const now = Date.now();
	activateTool(
		event.toolCallId,
		describeToolExecution(event.toolName, isRecord(event.args) ? event.args : undefined),
		ctx,
		now,
		now,
	);
}

function handleToolCall(event: ToolCallEvent, ctx: ExtensionContext): void {
	if (!state.active) {
		return;
	}

	activateTool(event.toolCallId, describeToolCall(event), ctx);
}

function handleToolExecutionUpdate(event: ToolExecutionUpdateEvent): void {
	if (!state.active) {
		return;
	}

	const now = Date.now();
	const tool = state.activeTools.get(event.toolCallId);
	if (!tool) {
		warnRuntimeOnce(
			`missing-tool-update:${event.toolCallId}`,
			`Received tool_execution_update for unknown toolCallId=${JSON.stringify(event.toolCallId)}.`,
		);
		return;
	}

	tool.lastProgressAt = now;
	state.lastProgressAt = now;
}

function handleToolExecutionEnd(event: ToolExecutionEndEvent, ctx: ExtensionContext): void {
	if (!state.active) {
		return;
	}

	const now = Date.now();
	state.activeTools.delete(event.toolCallId);
	state.lastProgressAt = now;
	if (state.activeTools.size === 0) {
		state.phase = "thinking";
	}
	renderSpinner(ctx, now);
}

function handleAssistantProgress(
	event: MessageStartEvent | MessageUpdateEvent,
	ctx: ExtensionContext,
	renderImmediately: boolean,
): void {
	if (!state.active || event.message.role !== "assistant") {
		return;
	}

	const now = Date.now();
	state.lastProgressAt = now;
	if (state.activeTools.size === 0) {
		const phaseChanged = state.phase !== "responding";
		state.phase = "responding";
		if (renderImmediately || phaseChanged) {
			renderSpinner(ctx, now);
		}
	}
}

function upsertTool(tool: ActiveToolState, toolCallId: string, now: number): void {
	state.activeTools.set(toolCallId, tool);
	state.lastProgressAt = now;
}

function activateTool(
	toolCallId: string,
	activity: ActivitySummary,
	ctx: ExtensionContext,
	now = Date.now(),
	startedAtOverride?: number,
): void {
	const existing = state.activeTools.get(toolCallId);
	upsertTool(
		{
			activity,
			startedAt: startedAtOverride ?? existing?.startedAt ?? now,
			lastProgressAt: now,
		},
		toolCallId,
		now,
	);
	state.phase = "tool";
	renderSpinner(ctx, now);
}

function getLeadTool(): ActiveToolState | undefined {
	return Array.from(state.activeTools.values()).sort((left, right) => {
		if (right.lastProgressAt !== left.lastProgressAt) {
			return right.lastProgressAt - left.lastProgressAt;
		}
		return right.startedAt - left.startedAt;
	})[0];
}

function renderSpinner(ctx: ExtensionContext, now = Date.now()): void {
	if (!state.active || !ctx.hasUI) {
		return;
	}

	const surface = getSpinnerSurface();
	const width = getTerminalWidth();
	const mode = getWidthMode(width);
	const frameIndex = Math.floor(Math.max(0, now - state.startedAt) / Math.max(config.tickMs, 1));
	const frame = FRAMES[frameIndex % FRAMES.length] ?? FRAMES[0];
	const elapsed = formatElapsed(Math.max(0, now - state.startedAt));
	const activity = getActivityText(mode);
	const stall = getStallText(now);
	const flavorPhase = getFlavorPhase(now);
	const headlineVerb = getHeadlineVerb(now, flavorPhase);
	const headline = colorizeHeadline(`${headlineVerb}...`, ctx, surface, now);
	const spinnerText =
		surface === "working-message"
			? buildWorkingMessage(width, mode, elapsed, headline, stall, activity)
			: buildStatusMessage(width, frame, elapsed, headline, stall, activity);

	applySpinnerUi(ctx, spinnerText);
}

function getActivityText(mode: WidthMode): string {
	if (state.activeTools.size === 0) {
		return state.phase === "responding" ? "Responding" : "Thinking";
	}

	const leadTool = getLeadTool();
	const activityText = mode === "narrow" ? leadTool.activity.compact : leadTool.activity.full;
	if (state.activeTools.size === 1) {
		return activityText;
	}
	if (mode === "narrow") {
		return `${state.activeTools.size} tools`;
	}
	return `${state.activeTools.size} tools · ${activityText}`;
}

function getStallText(now: number): string {
	const stalledMs = now - state.lastProgressAt;
	if (stalledMs < config.stallMs) {
		return "";
	}
	return `stalled ${formatElapsed(stalledMs)}`;
}

function getFlavorPhase(now: number): FlavorPhase {
	if (now - state.lastProgressAt >= config.stallMs) {
		return "stalled";
	}
	if (state.activeTools.size > 0) {
		return "tool";
	}
	if (state.phase === "responding") {
		return "responding";
	}
	return "thinking";
}

function seedFlavor(now: number, phase: FlavorPhase): void {
	state.lastFlavorPhase = phase;
	state.lastFlavorAt = now;
	const count = getFlavorCount(phase);
	state.flavorIndex = count === 0 ? 0 : hash(`${state.runToken}:${phase}`) % count;
}

function getRotatedFlavor(now: number, phase: FlavorPhase): string {
	const count = getFlavorCount(phase);
	if (count === 0) {
		return "";
	}

	if (state.lastFlavorPhase !== phase) {
		seedFlavor(now, phase);
	} else if (now - state.lastFlavorAt >= config.rotateMs) {
		const steps = Math.floor((now - state.lastFlavorAt) / config.rotateMs);
		state.flavorIndex = (state.flavorIndex + steps) % count;
		state.lastFlavorAt += steps * config.rotateMs;
	}

	return getFlavorText(phase, state.flavorIndex);
}

function getHeadlineVerb(now: number, phase: FlavorPhase): string {
	if (config.minimal) {
		return getMinimalFlavorText(phase);
	}

	const rotated = getRotatedFlavor(now, phase);
	return rotated || getMinimalFlavorText(phase);
}

function buildWorkingMessage(
	width: number,
	mode: WidthMode,
	elapsed: string,
	headline: string,
	stall: string,
	activity: string,
): string {
	const primary = appendSegment(`${elapsed} ${headline}`, stall, width, false);
	const secondary = state.activeTools.size > 0 ? truncateText(`     ${getWorkingActivityText(mode, activity)}`, width) : "";
	return secondary ? `${truncateText(primary, width)}\n${secondary}` : truncateText(primary, width);
}

function buildStatusMessage(
	width: number,
	frame: string,
	elapsed: string,
	headline: string,
	stall: string,
	activity: string,
): string {
	let line = `${frame} ${elapsed} ${headline}`;
	line = appendSegment(line, stall, width, false);
	line = appendSegment(line, activity, width, true);
	return truncateText(line, width);
}

function colorizeHeadline(text: string, ctx: ExtensionContext, surface: SpinnerSurface, now: number): string {
	if (config.colorMode === "off" || surface !== "working-message") {
		return text;
	}

	const waveSpec = getAccentWaveSpec(ctx);
	const graphemes = getGraphemeSegments(text);
	const visibleChars = graphemes.filter((char) => char.trim() !== "").length;
	if (visibleChars === 0) {
		return text;
	}
	const phase = Math.floor(Math.max(0, now - state.startedAt) / Math.max(config.waveStepMs, 1));
	const cycleLength = visibleChars + WAVE_PADDING * 2;
	const glimmerIndex = (phase % cycleLength) - WAVE_PADDING;
	let visualIndex = 0;
	return graphemes
		.map((char) => {
				if (char.trim() === "") {
					return char;
				}
				const distance = Math.abs(visualIndex - glimmerIndex);
				const intensity = getWaveIntensity(distance, config.waveSigma);
				const color = getWaveAnsi(waveSpec, intensity);
				visualIndex += 1;
				return `${color}${char}${ANSI_RESET}`;
			})
			.join("");
}

function getAccentWaveSpec(ctx: ExtensionContext): {
	mode: "truecolor" | "256color";
	accent: RgbColor;
	peak: RgbColor | undefined;
	lerpMax: number;
} {
	const theme = ctx.ui?.theme as
		| {
				getFgAnsi?: (color: string) => string;
				getColorMode?: () => "truecolor" | "256color";
		  }
		| undefined;
	const accentAnsi =
		theme && typeof theme.getFgAnsi === "function"
			? safeGetFgAnsi(theme.getFgAnsi.bind(theme), config.waveRole)
			: undefined;
	const fallbackAccentAnsi =
		!accentAnsi && theme && typeof theme.getFgAnsi === "function"
			? safeGetFgAnsi(theme.getFgAnsi.bind(theme), "accent")
			: undefined;
	const accent = parseAnsiColorToRgb(accentAnsi) ?? parseAnsiColorToRgb(fallbackAccentAnsi) ?? DEFAULT_PI_ACCENT_RGB;
	const peakAnsi =
		config.wavePeakRole && theme && typeof theme.getFgAnsi === "function"
			? safeGetFgAnsi(theme.getFgAnsi.bind(theme), config.wavePeakRole)
			: undefined;
	const peak = parseAnsiColorToRgb(peakAnsi);
	const mode =
		theme && typeof theme.getColorMode === "function"
			? safeGetColorMode(theme.getColorMode.bind(theme))
			: "truecolor";
	return { mode, accent, peak, lerpMax: config.waveLerpMax };
}

function safeGetColorMode(getColorMode: () => "truecolor" | "256color"): "truecolor" | "256color" {
	try {
		return getColorMode();
	} catch (error) {
		warnRuntimeOnce("theme-color-mode", `Theme getColorMode() failed: ${formatError(error)}.`);
		return "truecolor";
	}
}

function getWaveIntensity(distance: number, sigma: number): number {
	const spread = Math.exp(-(distance * distance) / (2 * sigma * sigma));
	return WAVE_MIN_INTENSITY + (WAVE_MAX_INTENSITY - WAVE_MIN_INTENSITY) * spread;
}

function lerpRgb(a: RgbColor, b: RgbColor, t: number): RgbColor {
	return {
		r: clamp(Math.round(a.r + (b.r - a.r) * t), 0, 255),
		g: clamp(Math.round(a.g + (b.g - a.g) * t), 0, 255),
		b: clamp(Math.round(a.b + (b.b - a.b) * t), 0, 255),
	};
}

function getWaveAnsi(
	spec: {
		mode: "truecolor" | "256color";
		accent: RgbColor;
		peak: RgbColor | undefined;
		lerpMax: number;
	},
	intensity: number,
): string {
	let color: RgbColor;
	if (spec.peak) {
		const tNorm = clamp((intensity - WAVE_MIN_INTENSITY) / (WAVE_MAX_INTENSITY - WAVE_MIN_INTENSITY), 0, 1);
		color = lerpRgb(spec.accent, spec.peak, tNorm * spec.lerpMax);
	} else {
		color = scaleRgb(spec.accent, intensity);
	}
	if (spec.mode === "256color") {
		return `\u001b[38;5;${rgbToXterm256(color)}m`;
	}
	return `\u001b[38;2;${color.r};${color.g};${color.b}m`;
}

function scaleRgb(color: RgbColor, intensity: number): RgbColor {
	const factor = clamp(intensity, 0.1, 1.25);
	if (factor > 1) {
		const lift = factor - 1;
		return {
			r: clamp(Math.round(color.r + (255 - color.r) * lift), 0, 255),
			g: clamp(Math.round(color.g + (255 - color.g) * lift), 0, 255),
			b: clamp(Math.round(color.b + (255 - color.b) * lift), 0, 255),
		};
	}
	return {
		r: clamp(Math.round(color.r * factor), 0, 255),
		g: clamp(Math.round(color.g * factor), 0, 255),
		b: clamp(Math.round(color.b * factor), 0, 255),
	};
}

function parseAnsiColorToRgb(ansi: string | undefined): RgbColor | undefined {
	if (!ansi) {
		return undefined;
	}
	const trueColor = ansi.match(/\u001b\[38;2;(\d{1,3});(\d{1,3});(\d{1,3})m/);
	if (trueColor) {
		return {
			r: clamp(Number(trueColor[1]), 0, 255),
			g: clamp(Number(trueColor[2]), 0, 255),
			b: clamp(Number(trueColor[3]), 0, 255),
		};
	}

	const indexed = ansi.match(/\u001b\[38;5;(\d{1,3})m/);
	if (indexed) {
		return xterm256ToRgb(clamp(Number(indexed[1]), 0, 255));
	}

	const basic = ansi.match(/\u001b\[(3[0-7]|9[0-7])m/);
	if (basic) {
		return basicAnsiToRgb(Number(basic[1]));
	}

	return undefined;
}

function xterm256ToRgb(index: number): RgbColor {
	const base16: RgbColor[] = [
		{ r: 0, g: 0, b: 0 },
		{ r: 128, g: 0, b: 0 },
		{ r: 0, g: 128, b: 0 },
		{ r: 128, g: 128, b: 0 },
		{ r: 0, g: 0, b: 128 },
		{ r: 128, g: 0, b: 128 },
		{ r: 0, g: 128, b: 128 },
		{ r: 192, g: 192, b: 192 },
		{ r: 128, g: 128, b: 128 },
		{ r: 255, g: 0, b: 0 },
		{ r: 0, g: 255, b: 0 },
		{ r: 255, g: 255, b: 0 },
		{ r: 0, g: 0, b: 255 },
		{ r: 255, g: 0, b: 255 },
		{ r: 0, g: 255, b: 255 },
		{ r: 255, g: 255, b: 255 },
	];
	if (index < 16) {
		return base16[index] ?? base16[7];
	}
	if (index <= 231) {
		const offset = index - 16;
		const rIndex = Math.floor(offset / 36);
		const gIndex = Math.floor((offset % 36) / 6);
		const bIndex = offset % 6;
		const levels = [0, 95, 135, 175, 215, 255];
		return {
			r: levels[rIndex] ?? 0,
			g: levels[gIndex] ?? 0,
			b: levels[bIndex] ?? 0,
		};
	}
	const gray = 8 + (index - 232) * 10;
	return { r: gray, g: gray, b: gray };
}

function basicAnsiToRgb(code: number): RgbColor {
	const colors: Record<number, RgbColor> = {
		30: { r: 0, g: 0, b: 0 },
		31: { r: 205, g: 49, b: 49 },
		32: { r: 13, g: 188, b: 121 },
		33: { r: 229, g: 229, b: 16 },
		34: { r: 36, g: 114, b: 200 },
		35: { r: 188, g: 63, b: 188 },
		36: { r: 17, g: 168, b: 205 },
		37: { r: 229, g: 229, b: 229 },
		90: { r: 102, g: 102, b: 102 },
		91: { r: 241, g: 76, b: 76 },
		92: { r: 35, g: 209, b: 139 },
		93: { r: 245, g: 245, b: 67 },
		94: { r: 59, g: 142, b: 234 },
		95: { r: 214, g: 112, b: 214 },
		96: { r: 41, g: 184, b: 219 },
		97: { r: 255, g: 255, b: 255 },
	};
	return colors[code] ?? DEFAULT_PI_ACCENT_RGB;
}

function rgbToXterm256(color: RgbColor): number {
	const levels = [0, 95, 135, 175, 215, 255];
	const nearestLevel = (value: number) => {
		let winner = 0;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (let index = 0; index < levels.length; index += 1) {
			const distance = Math.abs(levels[index] - value);
			if (distance < bestDistance) {
				bestDistance = distance;
				winner = index;
			}
		}
		return winner;
	};

	const r = nearestLevel(color.r);
	const g = nearestLevel(color.g);
	const b = nearestLevel(color.b);
	const cubeIndex = 16 + r * 36 + g * 6 + b;
	const cubeRgb = xterm256ToRgb(cubeIndex);
	const grayAverage = Math.round((color.r + color.g + color.b) / 3);
	const grayStep = clamp(Math.round((grayAverage - 8) / 10), 0, 23);
	const grayIndex = 232 + grayStep;
	const grayRgb = xterm256ToRgb(grayIndex);
	const cubeDistance = colorDistanceSquared(color, cubeRgb);
	const grayDistance = colorDistanceSquared(color, grayRgb);
	return grayDistance < cubeDistance ? grayIndex : cubeIndex;
}

function colorDistanceSquared(left: RgbColor, right: RgbColor): number {
	const dr = left.r - right.r;
	const dg = left.g - right.g;
	const db = left.b - right.b;
	return dr * dr + dg * dg + db * db;
}

function getGraphemeSegments(value: string): string[] {
	if (!value) {
		return [];
	}
	if (!GRAPHEME_SEGMENTER) {
		return Array.from(value);
	}
	return Array.from(GRAPHEME_SEGMENTER.segment(value), (entry) => entry.segment);
}

function safeGetFgAnsi(getFgAnsi: (color: string) => string, color: string): string | undefined {
	try {
		const ansi = getFgAnsi(color);
		return typeof ansi === "string" && ansi.length > 0 ? ansi : undefined;
	} catch (error) {
		warnRuntimeOnce(`theme-fg-${color}`, `Theme getFgAnsi(${color}) failed: ${formatError(error)}.`);
		return undefined;
	}
}

function getWorkingActivityText(mode: WidthMode, activity: string): string {
	if (mode === "wide") {
		return activity;
	}
	if (mode === "medium") {
		return truncateText(activity, Math.max(16, getTerminalWidth() - 5));
	}
	return truncateText(getCompactActivityText(), Math.max(12, getTerminalWidth() - 5));
}

function appendSegment(base: string, segment: string, width: number, allowTruncation: boolean): string {
	if (!segment) {
		return base;
	}

	const joined = `${base} · ${segment}`;
	if (visibleWidth(joined) <= width) {
		return joined;
	}

	if (!allowTruncation) {
		return base;
	}

	const remaining = width - visibleWidth(base) - visibleWidth(" · ");
	if (remaining < 6) {
		return base;
	}
	return `${base} · ${truncateText(segment, remaining)}`;
}

function applySpinnerUi(ctx: ExtensionContext, text: string): void {
	if (getSpinnerSurface() === "working-message") {
		ctx.ui.setWorkingMessage(text);
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}

	ctx.ui.setStatus(STATUS_KEY, text);
}

function clearSpinnerUi(ctx: ExtensionContext): void {
	ctx.ui.setWorkingMessage();
	ctx.ui.setStatus(STATUS_KEY, undefined);
}

function getWidthMode(width: number): WidthMode {
	if (width >= WIDE_WIDTH) {
		return "wide";
	}
	if (width >= MEDIUM_WIDTH) {
		return "medium";
	}
	return "narrow";
}

function getTerminalWidth(): number {
	const liveWidth = typeof process.stdout.columns === "number" ? process.stdout.columns : undefined;
	if (liveWidth && Number.isFinite(liveWidth) && liveWidth > 0) {
		return liveWidth;
	}

	const envWidth = Number(process.env.COLUMNS);
	if (Number.isFinite(envWidth) && envWidth > 0) {
		return envWidth;
	}

	return 80;
}

function getSpinnerSurface(): SpinnerSurface {
	return process.stdout.isTTY ? "working-message" : "status";
}

function getCompactActivityText(): string {
	if (state.activeTools.size === 0) {
		return state.phase === "responding" ? "Responding" : "Thinking";
	}

	const leadTool = getLeadTool();
	if (state.activeTools.size === 1) {
		return leadTool.activity.compact;
	}

	return `${state.activeTools.size} tools · ${leadTool.activity.compact}`;
}

function formatElapsed(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	if (totalSeconds < 60) {
		return `${totalSeconds}s`;
	}

	const totalMinutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (totalMinutes < 60) {
		return seconds === 0 ? `${totalMinutes}m` : `${totalMinutes}m${seconds}s`;
	}

	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes === 0 ? `${hours}h` : `${hours}h${minutes}m`;
}

function truncateText(value: string, maxWidth: number): string {
	if (maxWidth <= 0) {
		return "";
	}
	if (visibleWidth(value) <= maxWidth) {
		return value;
	}
	if (maxWidth <= 1) {
		return "…";
	}

	let result = "";
	let width = 0;
	let index = 0;
	let sawAnsi = false;
	const limit = maxWidth - 1;

	while (index < value.length && width < limit) {
		const ansi = readAnsiEscape(value, index);
		if (ansi) {
			result += ansi;
			index += ansi.length;
			sawAnsi = true;
			continue;
		}

		const grapheme = readNextGrapheme(value, index);
		if (!grapheme) {
			break;
		}
		result += grapheme.text;
		index += grapheme.length;
		width += grapheme.width;
	}

	return sawAnsi ? `${result}${ANSI_RESET}…${ANSI_RESET}` : `${result}…`;
}

function visibleWidth(value: string): number {
	let width = 0;
	let index = 0;
	while (index < value.length) {
		const ansi = readAnsiEscape(value, index);
		if (ansi) {
			index += ansi.length;
			continue;
		}

		const grapheme = readNextGrapheme(value, index);
		if (!grapheme) {
			break;
		}
		index += grapheme.length;
		width += grapheme.width;
	}
	return width;
}

function readAnsiEscape(value: string, start: number): string | null {
	if (start >= value.length || value[start] !== "\u001b") {
		return null;
	}

	const next = value[start + 1];
	if (next === "[") {
		let cursor = start + 2;
		while (cursor < value.length) {
			const code = value.charCodeAt(cursor);
			if (code === 0x6d) {
				return value.slice(start, cursor + 1);
			}
			if (code >= 0x40 && code <= 0x7e) {
				return null;
			}
			cursor += 1;
		}
		return null;
	}

	return null;
}

function readNextGrapheme(value: string, start: number): { text: string; length: number; width: number } | null {
	if (start >= value.length) {
		return null;
	}

	if (!GRAPHEME_SEGMENTER) {
		const codepoint = value.codePointAt(start);
		if (codepoint === undefined) {
			return null;
		}
		const text = String.fromCodePoint(codepoint);
		return {
			text,
			length: text.length,
			width: getGraphemeWidth(text),
		};
	}

	const sliced = value.slice(start);
	for (const entry of GRAPHEME_SEGMENTER.segment(sliced)) {
		const text = entry.segment;
		return {
			text,
			length: text.length,
			width: getGraphemeWidth(text),
		};
	}
	return null;
}

function getGraphemeWidth(value: string): number {
	if (!value) {
		return 0;
	}

	if (/^(?:\p{Control}|\p{Mark})+$/u.test(value)) {
		return 0;
	}

	if (/\p{Extended_Pictographic}/u.test(value)) {
		return 2;
	}

	const codepoint = value.codePointAt(0);
	if (codepoint === undefined) {
		return 0;
	}
	return isWideCodepoint(codepoint) ? 2 : 1;
}

function isWideCodepoint(codepoint: number): boolean {
	return (
		codepoint >= 0x1100 &&
		(codepoint <= 0x115f ||
			codepoint === 0x2329 ||
			codepoint === 0x232a ||
			((codepoint >= 0x2e80 && codepoint <= 0xa4cf) && codepoint !== 0x303f) ||
			(codepoint >= 0xac00 && codepoint <= 0xd7a3) ||
			(codepoint >= 0xf900 && codepoint <= 0xfaff) ||
			(codepoint >= 0xfe10 && codepoint <= 0xfe19) ||
			(codepoint >= 0xfe30 && codepoint <= 0xfe6f) ||
			(codepoint >= 0xff00 && codepoint <= 0xff60) ||
			(codepoint >= 0xffe0 && codepoint <= 0xffe6) ||
			(codepoint >= 0x1f300 && codepoint <= 0x1f64f) ||
			(codepoint >= 0x1f900 && codepoint <= 0x1f9ff) ||
			(codepoint >= 0x20000 && codepoint <= 0x3fffd))
	);
}

function loadConfig(): SpinnerConfig {
	return {
		stallMs: readPositiveInt("PI_SPINNER_STALL_MS", DEFAULT_STALL_MS, { warnInvalid: true }),
		tickMs: readPositiveInt("PI_SPINNER_TICK_MS", DEFAULT_TICK_MS, { warnInvalid: true }),
		rotateMs: readPositiveInt("PI_SPINNER_ROTATE_MS", DEFAULT_ROTATE_MS, { warnInvalid: true }),
		minimal: readBoolean("PI_SPINNER_MINIMAL"),
		colorMode: readColorMode("PI_SPINNER_COLOR_MODE"),
		waveStepMs: readPositiveInt("PI_SPINNER_WAVE_STEP_MS", DEFAULT_WAVE_STEP_MS, { warnInvalid: true }),
		waveRole: readWaveRole("PI_SPINNER_WAVE_ROLE"),
		wavePeakRole: readOptionalString("PI_SPINNER_WAVE_PEAK_ROLE") ?? DEFAULT_WAVE_PEAK_ROLE,
		waveLerpMax: readPositiveFloat("PI_SPINNER_WAVE_LERP_MAX", DEFAULT_WAVE_LERP_MAX),
		waveSigma: readPositiveFloat("PI_SPINNER_WAVE_SIGMA", DEFAULT_WAVE_SIGMA),
	};
}

function readWaveRole(name: string): string {
	const raw = process.env[name];
	if (!raw || raw.trim() === "") {
		return DEFAULT_WAVE_ROLE;
	}
	return raw.trim();
}

function readOptionalString(name: string): string | undefined {
	const raw = process.env[name];
	if (!raw || raw.trim() === "") {
		return undefined;
	}
	return raw.trim();
}

function readPositiveFloat(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw || raw.trim() === "") {
		return fallback;
	}
	const value = Number(raw.trim());
	if (Number.isFinite(value) && value > 0) {
		return value;
	}
	warnInvalidConfig(name, raw, ["positive number"], `${fallback}`);
	return fallback;
}

function readPositiveInt(name: string, fallback: number, options?: { warnInvalid?: boolean }): number {
	const raw = process.env[name];
	if (!raw || raw.trim() === "") {
		return fallback;
	}
	const normalized = raw.trim();
	if (/^[1-9]\d*$/.test(normalized)) {
		const value = Number(normalized);
		if (Number.isSafeInteger(value)) {
			return value;
		}
	}
	if (options?.warnInvalid) {
		warnInvalidConfig(name, raw, ["positive integer"], `${fallback}`);
	}
	return fallback;
}

function readBoolean(name: string): boolean {
	const raw = `${process.env[name] ?? ""}`.trim();
	if (!raw) {
		return false;
	}
	const normalized = raw.toLowerCase();
	if (normalized === "1" || normalized === "true" || normalized === "yes") {
		return true;
	}
	if (normalized === "0" || normalized === "false" || normalized === "no") {
		return false;
	}
	warnInvalidConfig(name, raw, ["1", "true", "yes", "0", "false", "no"], "false");
	return false;
}

function readColorMode(name: string): SpinnerColorMode {
	const raw = process.env[name];
	if (!raw || raw.trim() === "") {
		return "theme-wave";
	}
	const normalized = raw.trim().toLowerCase();
	switch (normalized) {
		case "off":
			return "off";
		case "theme-wave":
			return "theme-wave";
		default:
			warnInvalidConfig(name, raw, ["off", "theme-wave"], "off");
			return "off";
	}
}

function warnInvalidConfig(name: string, value: string, allowed: string[], fallback: string): void {
	if (INVALID_CONFIG_WARNINGS.has(name)) {
		return;
	}
	INVALID_CONFIG_WARNINGS.add(name);
	process.stderr.write(
			`[fancy-spinner] Invalid ${name}=${JSON.stringify(value)}. Allowed: ${allowed.join(", ")}. Using ${fallback}.\n`,
	);
}

function warnRuntimeOnce(key: string, message: string): void {
	if (RUNTIME_WARNINGS.has(key)) {
		return;
	}
	RUNTIME_WARNINGS.add(key);
	process.stderr.write(`[fancy-spinner] ${message}\n`);
}

function formatError(error: unknown): string {
	if (error instanceof Error && error.message) {
		return error.message;
	}
	return `${error ?? "unknown error"}`;
}

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) {
		return min;
	}
	return Math.min(max, Math.max(min, value));
}

function hash(value: string): number {
	let result = 0;
	for (const char of value) {
		result = (result * 31 + char.charCodeAt(0)) >>> 0;
	}
	return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
