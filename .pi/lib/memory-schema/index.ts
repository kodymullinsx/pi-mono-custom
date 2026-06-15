import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export type MemoryScope = "projects" | "work";

export type FrontmatterRecord = Record<string, string>;

export type MemoryDomainEntry = {
	domain: string;
	description: string;
	memoryFile: string;
	relativeMemoryFile: string;
	scope: MemoryScope;
};

function normalizeFilePath(filePath: string): string {
	return resolve(filePath).replace(/\\/g, "/");
}

function isMissingFileError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: string }).code === "ENOENT"
	);
}

export function extractFrontmatter(filePath: string): FrontmatterRecord {
	if (!existsSync(filePath)) return {};
	const content = readFileSync(filePath, "utf-8");
	if (!content.startsWith("---")) return {};

	const end = content.indexOf("---", 3);
	if (end === -1) return {};

	const result: FrontmatterRecord = {};
	for (const line of content.slice(3, end).trim().split("\n")) {
		const colonIndex = line.indexOf(":");
		if (colonIndex === -1) continue;

		const key = line.slice(0, colonIndex).trim();
		const value = line.slice(colonIndex + 1).trim();
		if (!key) continue;
		result[key] = value;
	}
	return result;
}

export function getMemoryScope(memoryRoot: string): MemoryScope {
	const normalized = normalizeFilePath(memoryRoot).toLowerCase();
	return normalized.includes("/work/memory") ? "work" : "projects";
}

function collectMemoryDomains(memoryRoot: string): MemoryDomainEntry[] {
	const scope = getMemoryScope(memoryRoot);
	const domains: MemoryDomainEntry[] = [];

	function addDomain(memoryFile: string): void {
		const frontmatter = extractFrontmatter(memoryFile);
		if (!frontmatter.domain || frontmatter.indexed === "false") return;

		domains.push({
			domain: frontmatter.domain,
			description: frontmatter.description ?? "",
			memoryFile,
			relativeMemoryFile: relative(memoryRoot, memoryFile),
			scope,
		});
	}

	const rootMemoryFile = join(memoryRoot, "memory.md");
	addDomain(rootMemoryFile);

	function walk(dir: string): void {
		let entries: string[];
		try {
			entries = readdirSync(dir).sort((left, right) => left.localeCompare(right));
		} catch (error) {
			if (isMissingFileError(error)) {
				return;
			}
			throw error;
		}

		for (const entry of entries) {
			const fullPath = join(dir, entry);
			try {
				if (!statSync(fullPath).isDirectory()) {
					continue;
				}
			} catch (error) {
				if (isMissingFileError(error)) {
					continue;
				}
				throw error;
			}

			const memoryFile = join(fullPath, "memory.md");
			addDomain(memoryFile);
			walk(fullPath);
		}
	}

	walk(memoryRoot);
	return domains.sort((left, right) => left.domain.localeCompare(right.domain));
}

export function discoverMemoryDomains(memoryRoot: string): MemoryDomainEntry[] {
	return collectMemoryDomains(memoryRoot);
}

export function generateMemoryIndex(memoryRoot: string): string {
	const scope = getMemoryScope(memoryRoot);
	const domains = collectMemoryDomains(memoryRoot);
	const lines: string[] = [];

	if (scope === "work") {
		lines.push("# Memory Domains — Work", "", "## Work");
		for (const domain of domains) {
			if (domain.domain === "work" || domain.domain.startsWith("work/")) {
				lines.push(`- **${domain.domain}** — ${domain.description}`);
			}
		}
		lines.push(
			"",
			"---",
			"",
			"All domain files are at `~/work/Memory/[path]/memory.md`. Read the relevant domain's memory.md for context.",
		);
		return `${lines.join("\n")}\n`;
	}

	const personal = domains.filter((domain) => domain.domain === "personal" || domain.domain.startsWith("personal/"));
	const projects = domains.filter((domain) => domain.domain === "projects" || domain.domain.startsWith("projects/"));

	lines.push("# Memory Domains — Personal + Projects", "");
	if (personal.length > 0) {
		lines.push("## Personal");
		for (const domain of personal) {
			lines.push(`- **${domain.domain}** — ${domain.description}`);
		}
	}
	if (projects.length > 0) {
		lines.push("## Projects");
		for (const domain of projects) {
			lines.push(`- **${domain.domain}** — ${domain.description}`);
		}
	}
	lines.push(
		"",
		"---",
		"",
		"All domain files are at `~/Workspace/Memory/[path]/memory.md`. Read the relevant domain's memory.md for context.",
	);
	return `${lines.join("\n")}\n`;
}
