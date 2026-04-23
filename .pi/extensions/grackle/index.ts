import type { ExtensionAPI, ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { VERSION } from "@mariozechner/pi-coding-agent";
import { truncateToWidth } from "@mariozechner/pi-tui";
import os from "node:os";

const DEFAULT_VARIANT_NAME = "oil-sheen";
const SETTINGS_TYPE = "grackle-settings";

type MascotState = {
	enabled: boolean;
	variantIndex: number;
};

type Pose = {
	r1L: string;
	r1M: string;
	r1R: string;
	r2L: string;
	r2M: string;
	r2R: string;
	r3L: string;
	r3M: string;
	r3R: string;
	label: string;
};

type Palette = {
	name: string;
	title: "accent" | "warning" | "success" | "text";
	body: "dim" | "muted" | "text";
	tail: "dim" | "muted" | "text";
	beak: "accent" | "warning" | "success";
	openBeak: "accent" | "warning" | "success";
	eye: "accent" | "warning" | "success";
	feet: "dim" | "muted" | "warning";
	hint: "dim" | "muted";
};

type GrackleSettings = {
	variantName?: string;
	enabled?: boolean;
};

const POSES: readonly Pose[] = [
	{
		r1L: "   ",
		r1M: "▗██▖",
		r1R: "▸ ",
		r2L: "▂▗",
		r2M: "▐██▐",
		r2R: "▌ ",
		r3L: " ▔",
		r3M: " ▝▘",
		r3R: " ▘ ",
		label: "ready",
	},
	{
		r1L: "   ",
		r1M: "▗██▖",
		r1R: "▷ ",
		r2L: "▂▗",
		r2M: "▐██━",
		r2R: "▌ ",
		r3L: " ▔",
		r3M: " ▝▘",
		r3R: " ▘ ",
		label: "caw",
	},
	{
		r1L: "◂  ",
		r1M: "▟██ ",
		r1R: "  ",
		r2L: "▂▗",
		r2M: "▌██▌",
		r2R: "▌ ",
		r3L: " ▔",
		r3M: " ▝▘",
		r3R: " ▘ ",
		label: "look",
	},
	{
		r1L: " ▝ ",
		r1M: "▗██▖",
		r1R: "▸ ",
		r2L: "▂▗",
		r2M: "▐██▐",
		r2R: "▌ ",
		r3L: " ▔",
		r3M: " ▝▘",
		r3R: " ▘ ",
		label: "flash",
	},
];

const PALETTES: readonly Palette[] = [
	{
		name: "aurum",
		title: "accent",
		body: "muted",
		tail: "dim",
		beak: "accent",
		openBeak: "warning",
		eye: "accent",
		feet: "warning",
		hint: "dim",
	},
	{
		name: "midnight",
		title: "text",
		body: "dim",
		tail: "muted",
		beak: "accent",
		openBeak: "warning",
		eye: "accent",
		feet: "muted",
		hint: "muted",
	},
	{
		name: "oil-sheen",
		title: "accent",
		body: "muted",
		tail: "dim",
		beak: "warning",
		openBeak: "warning",
		eye: "accent",
		feet: "warning",
		hint: "dim",
	},
	{
		name: "signal",
		title: "warning",
		body: "muted",
		tail: "dim",
		beak: "accent",
		openBeak: "success",
		eye: "warning",
		feet: "warning",
		hint: "muted",
	},
];

let state: MascotState = {
	enabled: true,
	variantIndex: PALETTES.findIndex((palette) => palette.name === DEFAULT_VARIANT_NAME),
};
let hasClearedStartupScreen = false;

function formatCwd(cwd: string): string {
	const homeDir = os.homedir();
	if (cwd === homeDir) return "~";
	if (cwd.startsWith(`${homeDir}/`)) return `~${cwd.slice(homeDir.length)}`;
	return cwd;
}

function clearStartupScreen(): void {
	if (hasClearedStartupScreen || !process.stdout.isTTY) return;
	process.stdout.write("\u001b[2J\u001b[3J\u001b[H");
	hasClearedStartupScreen = true;
}

function isLightTheme(theme: Theme): boolean {
	return (theme.name ?? "").toLowerCase().includes("light");
}

function resolvePalette(theme: Theme): Palette {
	const palette = PALETTES[state.variantIndex] ?? PALETTES[0];
	if (!isLightTheme(theme)) return palette;

	return {
		...palette,
		body: "text",
		tail: "text",
	};
}

function renderMascotLines(theme: Theme, width: number): string[] {
	const pose = POSES[0];
	const palette = resolvePalette(theme);

	const row1Text = `${pose.r1L}${pose.r1M}${pose.r1R}`;
	const row1 = (
		theme.fg(palette.tail, pose.r1L) +
			theme.fg(palette.body, pose.r1M) +
			theme.fg(pose.r1R.includes("▷") ? palette.openBeak : palette.beak, pose.r1R)
	);

	const eyeGlyph = pose.r2M.slice(3);
	const row2Text = `${pose.r2L}${pose.r2M}${pose.r2R}`;
	const row2 = (
		theme.fg(palette.tail, pose.r2L.slice(0, 1)) +
			theme.fg(palette.body, pose.r2L.slice(1)) +
			theme.fg(palette.body, pose.r2M.slice(0, 1)) +
			theme.fg(palette.body, pose.r2M.slice(1, 3)) +
			theme.fg(palette.eye, eyeGlyph) +
			theme.fg(palette.body, pose.r2R)
	);

	const row3Text = `${pose.r3L}${pose.r3M}${pose.r3R}`;
	const row3 = (
		theme.fg(palette.tail, pose.r3L) +
			theme.fg(palette.body, pose.r3M) +
			theme.fg(palette.feet, pose.r3R)
	);

	const productText = `Pi Coding Agent v${VERSION}`;
	const cwdText = formatCwd(process.cwd());
	const spacer = "   ";

	const line1 = truncateToWidth(
		row1 + spacer + theme.fg("text", productText),
		width,
	);
	const line2 = truncateToWidth(
		row2 + spacer + theme.fg("muted", cwdText),
		width,
	);
	const line3 = truncateToWidth(row3, width);
	const divider = theme.fg("dim", "─".repeat(Math.max(0, width)));
	return [line1, line2, line3, divider].map((line) => truncateToWidth(line, width));
}

function applyHeader(ctx: ExtensionContext): void {
	if (!ctx.hasUI) return;
	if (!state.enabled) {
		ctx.ui.setHeader(undefined);
		return;
	}

	ctx.ui.setHeader(
		(_tui, theme) => ({
			render(width: number) {
				return renderMascotLines(theme, width);
			},
			invalidate() {},
		}),
	);
}

function nextVariant(): void {
	state.variantIndex = (state.variantIndex + 1) % PALETTES.length;
}

function setVariantByName(name: string): boolean {
	const index = PALETTES.findIndex((palette) => palette.name === name);
	if (index === -1) return false;
	state.variantIndex = index;
	return true;
}

function persistSettings(pi: ExtensionAPI): void {
	pi.appendEntry<GrackleSettings>(SETTINGS_TYPE, {
		variantName: PALETTES[state.variantIndex]?.name ?? DEFAULT_VARIANT_NAME,
		enabled: state.enabled,
	});
}

function restoreSettings(ctx: ExtensionContext): void {
	let variantName = DEFAULT_VARIANT_NAME;
	let enabled = true;
	for (const entry of ctx.sessionManager.getEntries()) {
		if (entry.type !== "custom" || entry.customType !== SETTINGS_TYPE) continue;
		const data = entry.data as GrackleSettings | undefined;
		if (data?.variantName) {
			variantName = data.variantName;
		}
		if (typeof data?.enabled === "boolean") {
			enabled = data.enabled;
		}
	}

	if (!setVariantByName(variantName)) {
		setVariantByName(DEFAULT_VARIANT_NAME);
	}
	state.enabled = enabled;
}

export default function grackleExtension(pi: ExtensionAPI) {
	const applySessionUiState = (ctx: ExtensionContext, clearStartup = false) => {
		restoreSettings(ctx);
		if (clearStartup && ctx.hasUI) {
			clearStartupScreen();
		}
		applyHeader(ctx);
	};

	pi.on("session_start", async (event, ctx) => {
		applySessionUiState(ctx, event.reason === "startup" || event.reason === "reload");
	});

	pi.on("session_tree", async (_event, ctx) => {
		applySessionUiState(ctx);
	});

	pi.registerCommand("grackle", {
		description: "Show, hide, or change the grackle header",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				return;
			}

			const command = args.trim().toLowerCase() || "show";
			switch (command) {
				case "show":
				case "replay":
					state.enabled = true;
					persistSettings(pi);
					applyHeader(ctx);
					ctx.ui.notify("Grackle header shown", "info");
					return;
				case "next":
					nextVariant();
					state.enabled = true;
					persistSettings(pi);
					applyHeader(ctx);
					ctx.ui.notify(`Grackle variant: ${PALETTES[state.variantIndex]?.name ?? DEFAULT_VARIANT_NAME}`, "info");
					return;
				case "hide":
					state.enabled = false;
					persistSettings(pi);
					applyHeader(ctx);
					ctx.ui.notify("Built-in header restored", "info");
					return;
				default:
					if (command.startsWith("variant ")) {
						const name = command.slice("variant ".length).trim();
						if (setVariantByName(name)) {
							state.enabled = true;
							persistSettings(pi);
							applyHeader(ctx);
							ctx.ui.notify(`Grackle variant: ${name}`, "info");
							return;
						}
						ctx.ui.notify(
							`Unknown variant. Try: ${PALETTES.map((palette) => palette.name).join(", ")}`,
							"error",
						);
						return;
					}
					ctx.ui.notify(
						"Usage: /grackle [show|replay|next|hide|variant <name>]",
						"error",
					);
			}
		},
	});
}
