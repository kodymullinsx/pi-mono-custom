import path from "node:path";
import type { ToolCallEvent } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

export interface ActivitySummary {
	full: string;
	compact: string;
}

const DEFAULT_ACTIVITY: ActivitySummary = {
	full: "Working",
	compact: "Working",
};

export function describeToolCall(event: ToolCallEvent): ActivitySummary {
	return describeKnownTool(event.toolName, getToolCallArgs(event));
}

export function describeToolExecution(toolName: string, args: Record<string, unknown> | undefined): ActivitySummary {
	return describeKnownTool(toolName, {
		command: asString(args?.command),
		path: asString(args?.path),
		pattern: asString(args?.pattern),
	});
}

function describeKnownTool(
	toolName: string,
	args: {
		command?: string;
		path?: string;
		pattern?: string;
	},
): ActivitySummary {
	switch (toolName) {
		case "bash":
			return describeBash(args.command);
		case "read":
			return describeRead(args.path);
		case "grep":
			return describeGrep(args.pattern, args.path);
		case "find":
			return describeFind(args.pattern, args.path);
		case "ls":
			return describeLs(args.path);
		default:
			return describeGeneric(toolName);
	}
}

function getToolCallArgs(event: ToolCallEvent): {
	command?: string;
	path?: string;
	pattern?: string;
} {
	if (isToolCallEventType("bash", event)) {
		return { command: event.input.command };
	}
	if (isToolCallEventType("read", event)) {
		return { path: event.input.path };
	}
	if (isToolCallEventType("grep", event)) {
		return { path: event.input.path, pattern: event.input.pattern };
	}
	if (isToolCallEventType("find", event)) {
		return { path: event.input.path, pattern: event.input.pattern };
	}
	if (isToolCallEventType("ls", event)) {
		return { path: event.input.path };
	}
	return {};
}

function describeBash(command: string | undefined): ActivitySummary {
	const normalized = normalize(command);
	if (!normalized) {
		return {
			full: "Running command",
			compact: "Running command",
		};
	}

	return {
		full: `Running ${clip(normalized, 72)}`,
		compact: `Run ${clip(normalized, 28)}`,
	};
}

function describeRead(filePath: string | undefined): ActivitySummary {
	const readablePath = formatPath(filePath, "file");
	return {
		full: `Reading ${readablePath.full}`,
		compact: `Read ${readablePath.compact}`,
	};
}

function describeGrep(pattern: string | undefined, filePath: string | undefined): ActivitySummary {
	const patternText = formatPattern(pattern, "text");
	const readablePath = formatPath(filePath, "workspace");
	if (filePath) {
		return {
			full: `Searching ${readablePath.full} for ${patternText.full}`,
			compact: `Search ${patternText.compact}`,
		};
	}

	return {
		full: `Searching for ${patternText.full}`,
		compact: `Search ${patternText.compact}`,
	};
}

function describeFind(pattern: string | undefined, filePath: string | undefined): ActivitySummary {
	const patternText = formatPattern(pattern, "files");
	const readablePath = formatPath(filePath, "workspace");
	if (filePath) {
		return {
			full: `Finding ${patternText.full} in ${readablePath.full}`,
			compact: `Find ${patternText.compact}`,
		};
	}

	return {
		full: `Finding ${patternText.full}`,
		compact: `Find ${patternText.compact}`,
	};
}

function describeLs(filePath: string | undefined): ActivitySummary {
	const readablePath = formatPath(filePath, "workspace");
	return {
		full: `Listing ${readablePath.full}`,
		compact: `List ${readablePath.compact}`,
	};
}

function describeGeneric(toolName: string | undefined): ActivitySummary {
	const label = normalize(toolName);
	if (!label) {
		return DEFAULT_ACTIVITY;
	}

	return {
		full: `Running ${label}`,
		compact: `Run ${clip(label, 20)}`,
	};
}

function formatPattern(pattern: string | undefined, fallback: string): ActivitySummary {
	const normalized = stripWrappingQuotes(normalize(pattern));
	if (!normalized) {
		return { full: fallback, compact: fallback };
	}
	return {
		full: clip(normalized, 36),
		compact: clip(normalized, 18),
	};
}

function formatPath(filePath: string | undefined, fallback: string): ActivitySummary {
	const normalized = normalize(filePath);
	if (!normalized) {
		return { full: fallback, compact: fallback };
	}

	const compact = path.basename(normalized.replace(/\\/g, "/")) || normalized;
	return {
		full: clip(shortenPath(normalized), 48),
		compact: clip(compact, 18),
	};
}

function shortenPath(filePath: string): string {
	const normalized = filePath.replace(/\\/g, "/");
	const parts = normalized.split("/").filter(Boolean);
	if (normalized.startsWith("~/")) {
		const homeParts = normalized.slice(2).split("/").filter(Boolean);
		if (homeParts.length <= 3) {
			return normalized;
		}
		return `~/${homeParts.slice(-3).join("/")}`;
	}
	if (parts.length <= 3) {
		return normalized;
	}
	return parts.slice(-3).join("/");
}

function stripWrappingQuotes(value: string): string {
	return value.replace(/^['"`](.*)['"`]$/, "$1");
}

function normalize(value: string | undefined): string {
	return `${value ?? ""}`.replace(/\s+/g, " ").trim();
}

function clip(value: string, maxLength: number): string {
	const chars = Array.from(value);
	if (chars.length <= maxLength) {
		return value;
	}
	if (maxLength <= 1) {
		return "…";
	}
	return `${chars.slice(0, maxLength - 1).join("")}…`;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}
