import { resolve } from "node:path";

export interface CustomCompactionConfig {
	summary: {
		provider: string;
		modelId: string;
		maxTokens: number;
	};
	artifactIndex: {
		maxEntries: number;
		maxSummaryEntries: number;
		maxPreviewChars: number;
	};
	contextShaping: {
		enabled: boolean;
		customTypePrefix: string;
	};
	payloadCapture: {
		enabled: boolean;
		outputDir?: string;
		runLabel: string;
	};
}

const DEFAULT_CUSTOM_TYPE_PREFIX = "custom-compaction/";

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value === undefined) return fallback;
	return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}

function parseNumber(value: string | undefined, fallback: number): number {
	if (value === undefined) return fallback;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CustomCompactionConfig {
	const captureDir = env.PI_CUSTOM_COMPACTION_CAPTURE_DIR?.trim();
	return {
		summary: {
			provider: env.PI_CUSTOM_COMPACTION_SUMMARY_PROVIDER?.trim() || "google",
			modelId: env.PI_CUSTOM_COMPACTION_SUMMARY_MODEL?.trim() || "gemini-2.5-flash",
			maxTokens: parseNumber(env.PI_CUSTOM_COMPACTION_SUMMARY_MAX_TOKENS, 8192),
		},
		artifactIndex: {
			maxEntries: parseNumber(env.PI_CUSTOM_COMPACTION_MAX_ARTIFACTS, 150),
			maxSummaryEntries: parseNumber(env.PI_CUSTOM_COMPACTION_MAX_SUMMARY_ARTIFACTS, 20),
			maxPreviewChars: parseNumber(env.PI_CUSTOM_COMPACTION_MAX_PREVIEW_CHARS, 220),
		},
		contextShaping: {
			enabled: parseBoolean(env.PI_CUSTOM_COMPACTION_ENABLE_CONTEXT_SHAPING, false),
			customTypePrefix: env.PI_CUSTOM_COMPACTION_CUSTOM_TYPE_PREFIX?.trim() || DEFAULT_CUSTOM_TYPE_PREFIX,
		},
		payloadCapture: {
			enabled: Boolean(captureDir),
			outputDir: captureDir ? resolve(captureDir) : undefined,
			runLabel: env.PI_CUSTOM_COMPACTION_CAPTURE_RUN?.trim() || "capture",
		},
	};
}

