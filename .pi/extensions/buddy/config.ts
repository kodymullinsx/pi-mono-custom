export const BUDDY_WIDGET_KEY = "buddy";
export const BUDDY_STATE_TYPE = "buddy-state";
export const BUDDY_TRACE_TYPE = "buddy-trace";
export const BUDDY_WIDGET_PLACEMENT = "belowEditor" as const;
export const DEFAULT_BUDDY_MODEL = "openai-codex/gpt-5.4-mini";
export const DEFAULT_SPEAK_CHANCE = 0.2;
export const DEFAULT_COOLDOWN_MS = 30_000;
export const DEFAULT_SPEECH_MS = 10_000;
export const DEFAULT_TICK_MS = 500;
const EXPLICIT_PROVIDER_PREFIXES = ["novita", "deepinfra", "ollama", "llamacpp", "openai-codex", "anthropic", "openrouter"] as const;

export interface BuddyConfig {
	chance: number;
	muted: boolean;
	modelId: string;
	cooldownMs: number;
	speechMs: number;
	tickMs: number;
	traceEnabled: boolean;
}

export interface BuddyModelTarget {
	provider: string;
	id: string;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function parseProbability(raw: string | undefined): number {
	if (!raw) return DEFAULT_SPEAK_CHANCE;
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? clamp(parsed, 0, 1) : DEFAULT_SPEAK_CHANCE;
}

function parseBoolean(raw: string | undefined): boolean {
	if (!raw) return false;
	return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export function loadBuddyConfig(env: NodeJS.ProcessEnv = process.env): BuddyConfig {
	return {
		chance: parseProbability(env.PI_BUDDY_CHANCE),
		muted: parseBoolean(env.PI_BUDDY_MUTED),
		modelId: env.PI_BUDDY_MODEL?.trim() || DEFAULT_BUDDY_MODEL,
		cooldownMs: DEFAULT_COOLDOWN_MS,
		speechMs: DEFAULT_SPEECH_MS,
		tickMs: DEFAULT_TICK_MS,
		traceEnabled: parseBoolean(env.PI_BUDDY_TRACE),
	};
}

export function resolveBuddyModel(modelId: string): BuddyModelTarget {
	const normalized = modelId.trim();

	for (const provider of EXPLICIT_PROVIDER_PREFIXES) {
		const prefix = `${provider}/`;
		if (normalized.startsWith(prefix)) {
			return { provider, id: normalized.slice(prefix.length) };
		}
	}

	return { provider: "novita", id: normalized };
}
