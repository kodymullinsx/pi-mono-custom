export const mr_kitty = {
	id: "mr_kitty",
	name: "Mr. kitty",
	frames: [
		[" /\\_/\\ ", "(=^ω^=)", " (,,,) "],
		[" /\\_/\\ ", "(=^ω^=)", " (,,,)~"],
		[" /\\-/\\ ", "(=^ω^=)", " (,,,) "],
		[" /\\_/\\ ", "(=-ω-=)", " (,,,) "],
	],
	miniFrames: [["(=^ω^=)"], ["(=^ω^=)~"], ["(=>ω<=)"], ["(=-ω-=)"]],
} as const;

const IDLE_SEQUENCE = [0, 0, 0, 0, 1, 0, 0, 3, 0, 0, 2, 0, 0, 1, 0] as const;

export const MINIFIED_PANEL_WIDTH = 14;
export const CAT_SPRITE_HEIGHT = mr_kitty.frames[0].length;
export const CAT_SPRITE_WIDTH = mr_kitty.frames[0][0].length;
export const CAT_MINI_SPRITE_WIDTH = mr_kitty.miniFrames[0][0].length;

export function renderCat(frameTick: number, compact = false): string[] {
	const step = IDLE_SEQUENCE[frameTick % IDLE_SEQUENCE.length] ?? 0;
	const frames = compact ? mr_kitty.miniFrames : mr_kitty.frames;
	return [...frames[step]];
}
