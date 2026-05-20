import { existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ignore from "ignore";
import type { ResourceDiagnostic } from "./diagnostics.js";

const IGNORE_FILE_NAMES = [".gitignore", ".ignore", ".fdignore"];

export type IgnoreMatcher = ReturnType<typeof ignore>;
export type ResourceDiscoveryDiagnostic = (diagnostic: ResourceDiagnostic) => void;

export function createIgnoreMatcher(): IgnoreMatcher {
	return ignore();
}

export function toPosixPath(path: string): string {
	return path.split(sep).join("/");
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function warnResourceDiscovery(message: string, path: string, error: unknown): void {
	console.warn(`Warning: ${message}: ${path}: ${formatError(error)}`);
}

function prefixIgnorePattern(line: string, prefix: string): string | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("#") && !trimmed.startsWith("\\#")) return null;

	let pattern = line;
	let negated = false;

	if (pattern.startsWith("!")) {
		negated = true;
		pattern = pattern.slice(1);
	} else if (pattern.startsWith("\\!")) {
		pattern = pattern.slice(1);
	}

	if (pattern.startsWith("/")) {
		pattern = pattern.slice(1);
	}

	const prefixed = prefix ? `${prefix}${pattern}` : pattern;
	return negated ? `!${prefixed}` : prefixed;
}

export function addIgnoreRules(
	ig: IgnoreMatcher,
	dir: string,
	rootDir: string,
	onDiagnostic?: ResourceDiscoveryDiagnostic,
): void {
	const relativeDir = relative(rootDir, dir);
	const prefix = relativeDir ? `${toPosixPath(relativeDir)}/` : "";

	for (const filename of IGNORE_FILE_NAMES) {
		const ignorePath = join(dir, filename);
		if (!existsSync(ignorePath)) continue;
		try {
			const content = readFileSync(ignorePath, "utf-8");
			const patterns = content
				.split(/\r?\n/)
				.map((line) => prefixIgnorePattern(line, prefix))
				.filter((line): line is string => Boolean(line));
			if (patterns.length > 0) {
				ig.add(patterns);
			}
		} catch (error) {
			const diagnostic = {
				type: "warning" as const,
				message: `Unable to read ignore file ${filename}: ${formatError(error)}`,
				path: ignorePath,
			};
			if (onDiagnostic) {
				onDiagnostic(diagnostic);
			} else {
				warnResourceDiscovery("Unable to read ignore file", ignorePath, error);
			}
		}
	}
}
