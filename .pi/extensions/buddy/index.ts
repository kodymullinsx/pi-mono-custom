import { CustomEditor, type ExtensionAPI, type ExtensionContext, type Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

import {
	applyBuddyComment,
	createInitialBuddyState,
	extractBuddyConversation,
	generateBuddyComment,
	restoreBuddyState,
	shouldBuddySpeak,
	type BuddyState,
} from "./companion.ts";
import { createBuddyRequestId, persistBuddyTraceEntry } from "./diagnostics.ts";
import {
	BUDDY_STATE_TYPE,
	BUDDY_TRACE_TYPE,
	BUDDY_WIDGET_KEY,
	BUDDY_WIDGET_PLACEMENT,
	loadBuddyConfig,
	resolveBuddyModel,
} from "./config.ts";
import { CAT_MINI_SPRITE_WIDTH, CAT_SPRITE_WIDTH, MINIFIED_PANEL_WIDTH, mr_kitty, renderCat } from "./sprites.ts";

const MIN_BUBBLE_WIDTH = 8;
const SIDE_GAP = 1;
const MIN_EDITOR_WIDTH = 24;
const MAX_PANEL_WIDTH = 34;

function wrapText(text: string, maxWidth: number): string[] {
	const width = Math.max(MIN_BUBBLE_WIDTH, maxWidth);
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [""];

	const lines: string[] = [];
	let current = "";

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (candidate.length <= width) {
			current = candidate;
			continue;
		}

		if (current) lines.push(current);
		if (word.length <= width) {
			current = word;
			continue;
		}

		let remaining = word;
		while (remaining.length > width) {
			lines.push(remaining.slice(0, width));
			remaining = remaining.slice(width);
		}
		current = remaining;
	}

	if (current) lines.push(current);
	return lines;
}

function centerAlign(line: string, width: number): string {
	const remaining = Math.max(0, width - visibleWidth(line));
	const left = Math.floor(remaining / 2);
	const right = remaining - left;
	return `${" ".repeat(left)}${line}${" ".repeat(right)}`;
}

function rightAlign(line: string, width: number): string {
	const padding = Math.max(0, width - visibleWidth(line));
	return `${" ".repeat(padding)}${line}`;
}

function buildBubbleLines(text: string, width: number): string[] {
	const wrapped = wrapText(text, Math.max(MIN_BUBBLE_WIDTH, width - 4));
	const innerWidth = Math.max(...wrapped.map((line) => line.length), MIN_BUBBLE_WIDTH);
	return [
		`╭${"─".repeat(innerWidth + 2)}╮`,
		...wrapped.map((line) => `│ ${line.padEnd(innerWidth, " ")} │`),
		`╰${"─".repeat(innerWidth + 2)}╯`,
		`${" ".repeat(Math.max(1, Math.floor(innerWidth / 2)))}╲`,
		`${" ".repeat(Math.max(2, Math.floor(innerWidth / 2) + 1))}╲`,
	];
}

function renderBuddyPanelLines(
	width: number,
	state: BuddyState,
	frameTick: number,
	pending: boolean,
	muted: boolean,
	compact: boolean,
): string[] {
	const sprite = renderCat(frameTick, compact);
	const activeSpeech = state.commentExpiresAt && state.commentExpiresAt > Date.now() ? state.lastComment : undefined;
	const speech = activeSpeech || (pending ? "..." : undefined);
	const label = muted ? `${state.name} (muted)` : state.name;
	const spriteBlockWidth = Math.max(label.length, ...sprite.map((line) => visibleWidth(line)));

	const contentLines: string[] = [];
	if (speech) {
		const bubbleLines = buildBubbleLines(speech, Math.max(MIN_BUBBLE_WIDTH, width - 2));
		const bubbleBlockWidth = Math.max(...bubbleLines.map((line) => visibleWidth(line)), spriteBlockWidth);
		contentLines.push(...bubbleLines.map((line) => centerAlign(line, bubbleBlockWidth)));
		contentLines.push(...sprite.map((line) => centerAlign(line, bubbleBlockWidth)));
		contentLines.push(centerAlign(label, bubbleBlockWidth));
	} else {
		contentLines.push(...sprite.map((line) => centerAlign(line, spriteBlockWidth)));
		contentLines.push(centerAlign(label, spriteBlockWidth));
	}

	return contentLines.map((line) => truncateToWidth(rightAlign(line, width), width));
}

function styleBuddyPanelLines(lines: string[], theme: Theme): string[] {
	return lines.map((line) => theme.fg("accent", line));
}

class BuddyEditor extends CustomEditor {
	constructor(
		tui: ConstructorParameters<typeof CustomEditor>[0],
		theme: ConstructorParameters<typeof CustomEditor>[1],
		keybindings: ConstructorParameters<typeof CustomEditor>[2],
		private readonly getPanelLines: (panelWidth: number, compact: boolean) => string[],
		private readonly isSpeaking: () => boolean,
	) {
		super(tui, theme, keybindings);
	}

	render(width: number): string[] {
		const maxPanelWidth = Math.min(MAX_PANEL_WIDTH, width - MIN_EDITOR_WIDTH - SIDE_GAP);
		if (maxPanelWidth < CAT_MINI_SPRITE_WIDTH + 1) {
			return super.render(width);
		}

		const compact = maxPanelWidth <= MINIFIED_PANEL_WIDTH;
		const speaking = this.isSpeaking();
		const labelWidth = visibleWidth(mr_kitty.name);
		const spriteWidth = compact ? CAT_MINI_SPRITE_WIDTH : CAT_SPRITE_WIDTH;
		const naturalPanelWidth = Math.max(spriteWidth, labelWidth);
		const panelWidth = speaking ? maxPanelWidth : Math.min(maxPanelWidth, naturalPanelWidth);
		const editorWidth = Math.max(MIN_EDITOR_WIDTH, width - panelWidth - SIDE_GAP);
		const editorLines = super.render(editorWidth);
		const panelLines = this.getPanelLines(panelWidth, compact);
		const totalLines = Math.max(editorLines.length, panelLines.length);
		const panelStart = Math.max(0, totalLines - panelLines.length);
		const output: string[] = [];

		for (let index = 0; index < totalLines; index += 1) {
			const left = editorLines[index] ?? " ".repeat(editorWidth);
			const right = index >= panelStart ? panelLines[index - panelStart] ?? "" : "";
			const padding = " ".repeat(Math.max(1, editorWidth - visibleWidth(left) + SIDE_GAP));
			output.push(truncateToWidth(`${left}${padding}${right}`, width, ""));
		}

		return output;
	}
}

export default function buddyExtension(pi: ExtensionAPI) {
	const config = loadBuddyConfig();
	const warningKeys = new Set<string>();
	let state = createInitialBuddyState();
	let frameTick = 0;
	let requestRender: (() => void) | undefined;
	let sessionEpoch = 0;
	let generationInFlight = false;
	let animationTimer: ReturnType<typeof setInterval> | undefined;

	function persistState(): void {
		pi.appendEntry(BUDDY_STATE_TYPE, state);
	}

	function stopAnimation(): void {
		if (!animationTimer) return;
		clearInterval(animationTimer);
		animationTimer = undefined;
	}

	function startAnimation(): void {
		if (animationTimer) return;
		animationTimer = setInterval(() => {
			frameTick += 1;
			requestRender?.();
		}, config.tickMs);
	}

	function resetRuntime(ctx: ExtensionContext): void {
		sessionEpoch += 1;
		generationInFlight = false;
		frameTick = 0;
		requestRender = undefined;
		stopAnimation();
		if (ctx.hasUI) {
			ctx.ui.setStatus(BUDDY_WIDGET_KEY, undefined);
			ctx.ui.setWidget(BUDDY_WIDGET_KEY, undefined);
			ctx.ui.setEditorComponent(undefined);
		}
	}

	function warnOnce(ctx: ExtensionContext, key: string | undefined, message: string | undefined): void {
		if (!key || !message || warningKeys.has(key)) return;
		warningKeys.add(key);
		if (ctx.hasUI) {
			ctx.ui.notify(message, "warning");
			return;
		}
		console.warn(`[buddy] ${message}`);
	}

	function mountInteractiveEditor(ctx: ExtensionContext): void {
		const liveTheme = ctx.ui.theme;
		ctx.ui.setWidget(BUDDY_WIDGET_KEY, undefined);
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			requestRender = () => tui.requestRender();
			startAnimation();
			return new BuddyEditor(
				tui,
				theme,
				keybindings,
				(panelWidth, compact) =>
					styleBuddyPanelLines(
						renderBuddyPanelLines(panelWidth, state, frameTick, generationInFlight, config.muted, compact),
						liveTheme,
					),
				() => Boolean((state.commentExpiresAt && state.commentExpiresAt > Date.now()) || generationInFlight),
			);
		});
	}

	function mountWidgetFallback(ctx: ExtensionContext): void {
		ctx.ui.setEditorComponent(undefined);
		ctx.ui.setWidget(
			BUDDY_WIDGET_KEY,
			(tui, theme) => {
				requestRender = () => tui.requestRender();
				startAnimation();
				return {
					invalidate() {},
					render(width: number): string[] {
						const compact = width <= MINIFIED_PANEL_WIDTH;
						return styleBuddyPanelLines(
							renderBuddyPanelLines(width, state, frameTick, generationInFlight, config.muted, compact),
							theme,
						);
					},
				};
			},
			{ placement: BUDDY_WIDGET_PLACEMENT },
		);
	}

	function mountSurface(ctx: ExtensionContext): void {
		if (!ctx.hasUI) return;
		if (process.stdout.isTTY) {
			mountInteractiveEditor(ctx);
			return;
		}
		mountWidgetFallback(ctx);
	}

	async function speak(ctx: ExtensionContext, options: { force?: boolean; manualPrompt?: string } = {}): Promise<boolean> {
		if (config.muted) {
			if (options.force && ctx.hasUI) ctx.ui.notify("Buddy is muted via PI_BUDDY_MUTED.", "info");
			return false;
		}

		if (generationInFlight) {
			if (options.force && ctx.hasUI) ctx.ui.notify(`${state.name} is already thinking.`, "info");
			return false;
		}

		if (!shouldBuddySpeak(state, config, Date.now(), options.force === true)) {
			return false;
		}

		const epoch = sessionEpoch;
		generationInFlight = true;
		requestRender?.();
		if (ctx.hasUI) ctx.ui.setStatus(BUDDY_WIDGET_KEY, ctx.ui.theme.fg("accent", `${state.name} is thinking…`));

		try {
			const result = await generateBuddyComment(
				ctx,
				config,
				{
					...extractBuddyConversation(ctx.sessionManager.getBranch()),
					manualPrompt: options.manualPrompt?.trim() || undefined,
				},
				createBuddyRequestId(),
			);

			warnOnce(ctx, result.warningKey, result.warningMessage);
			const tracePersistence = persistBuddyTraceEntry(pi.appendEntry.bind(pi), BUDDY_TRACE_TYPE, config.traceEnabled, result.trace, epoch, sessionEpoch);
			if (tracePersistence === "stale") return false;
			if (result.aborted || !result.text || !result.source) return false;

			state = applyBuddyComment(state, result.text, config, result.source);
			persistState();
			requestRender?.();
			return true;
		} finally {
			if (epoch === sessionEpoch) {
				generationInFlight = false;
				if (ctx.hasUI) ctx.ui.setStatus(BUDDY_WIDGET_KEY, undefined);
				requestRender?.();
			}
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		resetRuntime(ctx);
		const restored = restoreBuddyState(ctx.sessionManager.getBranch());
		state = restored ?? createInitialBuddyState();
		state = { ...state, name: mr_kitty.name };
		if (!restored) persistState();
		mountSurface(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		resetRuntime(ctx);
	});

	pi.on("agent_end", async (_event, ctx) => {
		speak(ctx).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`[buddy] Failed to comment: ${message}`);
			if (ctx.hasUI) ctx.ui.notify(`Buddy failed to comment: ${message}`, "warning");
		});
	});

	pi.registerCommand("buddy", {
		description: "Make the cat companion speak, or use /buddy help and /buddy status",
		handler: async (args, ctx) => {
			const command = args.trim();
			if (command === "help") {
				ctx.ui.notify("/buddy\n/buddy status\n/buddy <prompt>\nEnv: PI_BUDDY_CHANCE, PI_BUDDY_MUTED, PI_BUDDY_MODEL", "info");
				return;
			}

			if (command === "status") {
				const model = resolveBuddyModel(config.modelId);
				ctx.ui.notify(
					[
						`Buddy: ${state.name}`,
						`Model: ${model.provider}/${model.id}`,
						`Chance: ${(config.chance * 100).toFixed(0)}%`,
						`Muted: ${config.muted ? "yes" : "no"}`,
						`Cooldown: ${(config.cooldownMs / 1000).toFixed(0)}s`,
					].join("\n"),
					"info",
				);
				return;
			}

			const spoke = await speak(ctx, { force: true, manualPrompt: command || undefined });
			if (!spoke && ctx.hasUI && !config.muted) {
				ctx.ui.notify(`${state.name} stayed quiet. Check any buddy warnings above.`, "info");
			}
		},
	});
}
