import type {
	BashToolDetails,
	EditToolDetails,
	ExtensionAPI,
	FindToolDetails,
	GrepToolDetails,
	LsToolDetails,
} from "@mariozechner/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createWriteTool,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

function buildExpandedPreview(
	lines: string[],
	theme: any,
	maxLines: number,
	colorize?: (line: string) => string,
): string {
	let text = "";

	for (const line of lines.slice(0, maxLines)) {
		text += `\n${colorize ? colorize(line) : theme.fg("dim", line)}`;
	}

	if (lines.length > maxLines) {
		text += `\n${theme.fg("muted", `... ${lines.length - maxLines} more lines`)}`;
	}

	return text;
}

function getPrimaryText(result: { content?: Array<{ type: string; text?: string }> }): string {
	return (
		result.content?.find(
			(content): content is { type: "text"; text: string } =>
				content.type === "text" && typeof content.text === "string",
		)?.text ?? ""
	);
}

function countNonEmptyLines(text: string): number {
	return text.split("\n").filter((line) => line.trim().length > 0).length;
}

function truncateText(text: string, maxChars: number): string {
	return text.length > maxChars ? `${text.slice(0, maxChars - 3)}...` : text;
}

function stripTrailingNoticeBlock(text: string): string {
	const noticeStart = text.lastIndexOf("\n\n[");
	if (noticeStart === -1 || !text.endsWith("]")) return text;

	const notice = text.slice(noticeStart + 2);
	if (notice.includes("\n")) return text;

	return text.slice(0, noticeStart);
}

function getOutputLines(text: string, zeroSentinel?: string): string[] {
	const cleaned = stripTrailingNoticeBlock(text).trim();
	if (!cleaned || cleaned === zeroSentinel) return [];
	return cleaned.split("\n").filter((line) => line.length > 0);
}

function countListedLines(text: string, zeroSentinel?: string): number {
	return getOutputLines(text, zeroSentinel).length;
}

function isGrepMatchLine(line: string): boolean {
	return /:\d+:\s/.test(line);
}

function countGrepMatches(text: string): number {
	return getOutputLines(text, "No matches found").filter((line) => isGrepMatchLine(line)).length;
}

function countDiffChanges(diff: string): { additions: number; removals: number } {
	let additions = 0;
	let removals = 0;

	for (const line of diff.split("\n")) {
		if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
		if (line.startsWith("-") && !line.startsWith("---")) removals += 1;
	}

	return { additions, removals };
}

export default function compactToolRenderer(pi: ExtensionAPI) {
	const cwd = process.cwd();

	const originalGrep = createGrepTool(cwd);
	pi.registerTool({
		...originalGrep,

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("grep "));
			const pattern = typeof args.pattern === "string" ? args.pattern : "";
			const path = typeof args.path === "string" ? args.path : ".";
			text += theme.fg("accent", `"${truncateText(pattern, 60)}"`);
			text += theme.fg("dim", " in ");
			text += theme.fg("accent", path);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);

			const details = result.details as GrepToolDetails | undefined;
			const output = getPrimaryText(result as { content?: Array<{ type: string; text?: string }> });

			if (context?.isError) {
				return new Text(theme.fg("error", output.split("\n")[0] || "Grep failed"), 0, 0);
			}

			const matchCount = countGrepMatches(output);
			let text = theme.fg("success", `${matchCount} matches`);

			if (details?.matchLimitReached) {
				text += theme.fg("warning", " [limit reached]");
			}
			if (details?.linesTruncated) {
				text += theme.fg("warning", " [lines truncated]");
			}

			if (expanded && output) {
				text += buildExpandedPreview(output.split("\n"), theme, 30, (line) =>
					isGrepMatchLine(line) ? theme.fg("accent", line) : theme.fg("dim", line),
				);
			}

			return new Text(text, 0, 0);
		},
	});

	const originalFind = createFindTool(cwd);
	pi.registerTool({
		...originalFind,

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("find "));
			text += theme.fg("accent", String(args.pattern ?? ""));
			if (typeof args.path === "string") {
				text += theme.fg("dim", " in ");
				text += theme.fg("accent", args.path);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Finding..."), 0, 0);

			const details = result.details as FindToolDetails | undefined;
			const output = getPrimaryText(result as { content?: Array<{ type: string; text?: string }> });

			if (context?.isError) {
				return new Text(theme.fg("error", output.split("\n")[0] || "Find failed"), 0, 0);
			}

			const resultCount = countListedLines(output, "No files found matching pattern");
			let text = theme.fg("success", `${resultCount} results`);

			if (details?.resultLimitReached) {
				text += theme.fg("warning", " [limit reached]");
			}

			if (expanded && output) {
				text += buildExpandedPreview(output.split("\n"), theme, 20);
			}

			return new Text(text, 0, 0);
		},
	});

	const originalLs = createLsTool(cwd);
	pi.registerTool({
		...originalLs,

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("ls "));
			text += theme.fg("accent", String(args.path ?? "."));
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Listing..."), 0, 0);

			const details = result.details as LsToolDetails | undefined;
			const output = getPrimaryText(result as { content?: Array<{ type: string; text?: string }> });

			if (context?.isError) {
				return new Text(theme.fg("error", output.split("\n")[0] || "List failed"), 0, 0);
			}

			const entryCount = countListedLines(output, "(empty directory)");
			let text = theme.fg("success", `${entryCount} entries`);

			if (details?.entryLimitReached) {
				text += theme.fg("warning", " [limit reached]");
			}

			if (expanded && output) {
				text += buildExpandedPreview(output.split("\n"), theme, 20);
			}

			return new Text(text, 0, 0);
		},
	});

	const originalBash = createBashTool(cwd);
	pi.registerTool({
		...originalBash,

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("$ "));
			const command = typeof args.command === "string" ? args.command : "";
			text += theme.fg("accent", command.length > 80 ? `${command.slice(0, 77)}...` : command);
			if (args.timeout !== undefined) {
				text += theme.fg("dim", ` (timeout: ${args.timeout}s)`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Running..."), 0, 0);

			const details = result.details as BashToolDetails | undefined;
			const output = getPrimaryText(result as { content?: Array<{ type: string; text?: string }> });
			const exitMatch = output.match(/Command exited with code (\d+)/);
			const exitCode = exitMatch ? Number(exitMatch[1]) : null;
			const lineCount = countNonEmptyLines(output);

			let text = "";
			if (context?.isError) {
				if (exitCode !== null) {
					text += theme.fg("error", `exit ${exitCode}`);
				} else {
					text += theme.fg("error", "failed");
				}
			} else {
				text += theme.fg("success", "done");
			}
			text += theme.fg("dim", ` (${lineCount} lines)`);

			if (details?.truncation?.truncated) {
				text += theme.fg("warning", " [truncated]");
			}

			if (expanded && output) {
				text += buildExpandedPreview(output.split("\n"), theme, 20);
			}

			return new Text(text, 0, 0);
		},
	});

	const originalEdit = createEditTool(cwd);
	pi.registerTool({
		...originalEdit,

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("edit "));
			text += theme.fg("accent", String(args.path ?? ""));
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Editing..."), 0, 0);

			const details = result.details as EditToolDetails | undefined;
			const output = getPrimaryText(result as { content?: Array<{ type: string; text?: string }> });

			if (context?.isError) {
				return new Text(theme.fg("error", output.split("\n")[0] || "Edit failed"), 0, 0);
			}

			if (!details?.diff) {
				return new Text(theme.fg("success", "Applied"), 0, 0);
			}

			const { additions, removals } = countDiffChanges(details.diff);
			let text = theme.fg("success", `+${additions}`);
			text += theme.fg("dim", " / ");
			text += theme.fg("error", `-${removals}`);

			if (expanded) {
				text += buildExpandedPreview(details.diff.split("\n"), theme, 30, (line) => {
					if (line.startsWith("+") && !line.startsWith("+++")) return theme.fg("success", line);
					if (line.startsWith("-") && !line.startsWith("---")) return theme.fg("error", line);
					return theme.fg("dim", line);
				});
			}

			return new Text(text, 0, 0);
		},
	});

	const originalWrite = createWriteTool(cwd);
	pi.registerTool({
		...originalWrite,

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("write "));
			text += theme.fg("accent", String(args.path ?? ""));
			if (typeof args.content === "string") {
				text += theme.fg("dim", ` (${args.content.split("\n").length} lines)`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, context) {
			if (isPartial) return new Text(theme.fg("warning", "Writing..."), 0, 0);

			const output = getPrimaryText(result as { content?: Array<{ type: string; text?: string }> });
			if (context?.isError) {
				return new Text(theme.fg("error", output.split("\n")[0] || "Write failed"), 0, 0);
			}

			const bytesMatch = output.match(/Successfully wrote (\d+) bytes/);
			let text = theme.fg("success", "Written");
			if (bytesMatch) {
				text += theme.fg("dim", ` (${bytesMatch[1]} bytes)`);
			}

			if (expanded && output) {
				text += `\n${theme.fg("dim", output)}`;
			}

			return new Text(text, 0, 0);
		},
	});
}
