/**
 * /context
 *
 * Small TUI view showing what's loaded/available:
 * - extensions (best-effort from registered extension slash commands)
 * - skills
 * - project context files (AGENTS.md / CLAUDE.md)
 * - current context window usage + session totals (tokens/cost)
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, ToolResultEvent } from "@mariozechner/pi-coding-agent";
import { DynamicBorder, getAgentDir as getPiAgentDir, loadProjectContextFiles as loadPiProjectContextFiles } from "@mariozechner/pi-coding-agent";
import { Container, Key, Text, matchesKey, type Component, type TUI } from "@mariozechner/pi-tui";
import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

function formatUsd(cost: number): string {
	if (!Number.isFinite(cost) || cost <= 0) return "$0.00";
	if (cost >= 1) return `$${cost.toFixed(2)}`;
	if (cost >= 0.1) return `$${cost.toFixed(3)}`;
	return `$${cost.toFixed(4)}`;
}

function estimateTokens(text: string): number {
	// Deliberately fuzzy (good enough for “how big-ish is this”).
	return Math.max(0, Math.ceil(text.length / 4));
}

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const NARROW_NO_BREAK_SPACE = "\u202F";

function normalizeUnicodeSpaces(input: string): string {
	return input.replace(UNICODE_SPACES, " ");
}

function tryMacOSScreenshotPath(filePath: string): string {
	return filePath.replace(/ (AM|PM)\./gi, `${NARROW_NO_BREAK_SPACE}$1.`);
}

function tryNFDVariant(filePath: string): string {
	return filePath.normalize("NFD");
}

function tryCurlyQuoteVariant(filePath: string): string {
	return filePath.replace(/'/g, "\u2019");
}

function fileExists(filePath: string): boolean {
	try {
		accessSync(filePath, constants.F_OK);
		return true;
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
			return false;
		}
		throw error;
	}
}

function describeError(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function resolveReadPathForTracking(inputPath: string, cwd: string): { path: string | null; diagnostic: string | null } {
	try {
		return { path: resolveReadPath(inputPath, cwd), diagnostic: null };
	} catch (error) {
		return {
			path: null,
			diagnostic: `failed to resolve read path ${inputPath}: ${describeError(error)}`,
		};
	}
}

function normalizeAtPrefix(filePath: string): string {
	return filePath.startsWith("@") ? filePath.slice(1) : filePath;
}

function resolveReadPath(inputPath: string, cwd: string): string {
	const normalized = normalizeUnicodeSpaces(normalizeAtPrefix(inputPath));
	const expanded =
		normalized === "~"
			? os.homedir()
			: normalized.startsWith("~/")
				? os.homedir() + normalized.slice(1)
				: normalized;
	const resolved = path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
	if (fileExists(resolved)) return resolved;

	const amPmVariant = tryMacOSScreenshotPath(resolved);
	if (amPmVariant !== resolved && fileExists(amPmVariant)) return amPmVariant;

	const nfdVariant = tryNFDVariant(resolved);
	if (nfdVariant !== resolved && fileExists(nfdVariant)) return nfdVariant;

	const curlyVariant = tryCurlyQuoteVariant(resolved);
	if (curlyVariant !== resolved && fileExists(curlyVariant)) return curlyVariant;

	const nfdCurlyVariant = tryCurlyQuoteVariant(nfdVariant);
	if (nfdCurlyVariant !== resolved && fileExists(nfdCurlyVariant)) return nfdCurlyVariant;

	return resolved;
}

function getAgentDir(): string {
	return path.resolve(getPiAgentDir());
}

type ReadFileResult =
	| { status: "ok"; path: string; content: string; bytes: number }
	| { status: "missing"; path: string }
	| { status: "error"; path: string; error: string };

async function readFileIfExists(filePath: string): Promise<ReadFileResult> {
	try {
		const buf = await fs.readFile(filePath);
		return { status: "ok", path: filePath, content: buf.toString("utf8"), bytes: buf.byteLength };
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
			return { status: "missing", path: filePath };
		}
		return {
			status: "error",
			path: filePath,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

function listContextCandidateDirs(cwd: string): string[] {
	const dirs = [getAgentDir()];
	const ancestors: string[] = [];
	let current = path.resolve(cwd);
	while (true) {
		ancestors.unshift(current);
		const parent = path.resolve(current, "..");
		if (parent === current) break;
		current = parent;
	}
	dirs.push(...ancestors);
	return dirs;
}

type ProjectContextFile = {
	path: string;
	content: string;
	tokens: number;
	bytes: number;
};

type ProjectContextDiscovery = {
	files: ProjectContextFile[];
	errors: Array<{ path: string; error: string }>;
};

type LoadedContextSummary = {
	files: ProjectContextFile[];
	summary: string;
	diagnostics: string[];
	discoveredCount: number;
	verificationMode: "none" | "verified" | "no-system-prompt" | "no-markers";
};

async function loadProjectContextFiles(cwd: string): Promise<ProjectContextDiscovery> {
	const out = loadPiProjectContextFiles({ cwd, agentDir: getAgentDir() }).map((file) => ({
		path: file.path,
		content: file.content,
		tokens: estimateTokens(file.content),
		bytes: Buffer.byteLength(file.content, "utf8"),
	}));
	const errors: Array<{ path: string; error: string }> = [];
	for (const dir of listContextCandidateDirs(cwd)) {
		for (const name of ["AGENTS.md", "CLAUDE.md"]) {
			const filePath = path.join(dir, name);
			const result = await readFileIfExists(filePath);
			if (result.status === "error") {
				errors.push({ path: result.path, error: result.error });
			}
		}
	}

	return { files: out, errors };
}

function summarizeLoadedContextFiles(discovery: ProjectContextDiscovery, systemPrompt: string): LoadedContextSummary {
	const diagnostics = discovery.errors.map((entry) => `discovery failed for ${entry.path}: ${entry.error}`);
	if (discovery.files.length === 0) {
		return {
			files: [],
			summary: diagnostics.length > 0 ? "unable to inspect context files on disk" : "(none)",
			diagnostics,
			discoveredCount: 0,
			verificationMode: "none",
		};
	}

	if (!systemPrompt) {
		return {
			files: [],
			summary: `no system prompt available for verification (${discovery.files.length} discovered on disk)`,
			diagnostics,
			discoveredCount: discovery.files.length,
			verificationMode: "no-system-prompt",
		};
	}

	const matchedFiles = discovery.files.filter((file) => systemPrompt.includes(`## ${file.path}`));
	if (matchedFiles.length === 0) {
		return {
			files: [],
			summary: `verification found no context-file markers (${discovery.files.length} discovered on disk)`,
			diagnostics,
			discoveredCount: discovery.files.length,
			verificationMode: "no-markers",
		};
	}

	const unmatchedCount = discovery.files.length - matchedFiles.length;
	const summary =
		matchedFiles.length === discovery.files.length
			? joinComma(matchedFiles.map((file) => file.path))
			: `${joinComma(matchedFiles.map((file) => file.path))} (+${unmatchedCount} unverified)`;
	return {
		files: matchedFiles,
		summary,
		diagnostics,
		discoveredCount: discovery.files.length,
		verificationMode: "verified",
	};
}

function normalizeSkillName(name: string): string {
	return name.startsWith("skill:") ? name.slice("skill:".length) : name;
}

function getCommandSourcePath(command: { path?: string; sourceInfo?: { path?: string } }): string {
	return command.sourceInfo?.path ?? command.path ?? "";
}

function formatCommandSourcePath(
	command: { path?: string; sourceInfo?: { path?: string; baseDir?: string } },
	cwd: string,
): string {
	const sourcePath = getCommandSourcePath(command);
	if (!sourcePath) return "<unknown>";

	const resolvedSourcePath = path.resolve(sourcePath);
	const baseDir = command.sourceInfo?.baseDir;
	if (baseDir) {
		const resolvedBaseDir = path.resolve(baseDir);
		if (resolvedSourcePath.startsWith(resolvedBaseDir + path.sep)) {
			return resolvedSourcePath.slice(resolvedBaseDir.length + 1);
		}
	}

	return shortenPath(resolvedSourcePath, cwd);
}

type SkillIndexEntry = {
	name: string;
	skillFilePath: string;
	skillDir: string;
};

type SkillLoadNoteEntryData = {
	message: string;
};

function buildSkillIndex(pi: ExtensionAPI, cwd: string): { entries: SkillIndexEntry[]; diagnostics: string[] } {
	const diagnostics: string[] = [];
	const entries = pi
			.getCommands()
			.filter((c) => c.source === "skill")
			.map((c) => {
				const sourcePath = getCommandSourcePath(c);
				let p = "";
				if (sourcePath) {
					const resolved = resolveReadPathForTracking(sourcePath, cwd);
					if (resolved.diagnostic) {
						diagnostics.push(`failed to index skill path ${sourcePath}: ${resolved.diagnostic}`);
						p = path.resolve(sourcePath);
					} else if (resolved.path) {
						p = resolved.path;
					}
				}
				return {
					name: normalizeSkillName(c.name),
					skillFilePath: p,
					skillDir: p ? path.dirname(p) : "",
				};
			})
			.filter((x) => x.name && x.skillDir);
	return { entries, diagnostics };
}

const SKILL_LOADED_ENTRY = "context:skill_loaded";
const SKILL_LOAD_NOTE_ENTRY = "context:skill_load_note";

type SkillLoadedEntryData = {
	name: string;
	path: string;
};

function getLoadedSkillsFromSession(ctx: ExtensionContext): Set<string> {
	const out = new Set<string>();
	for (const e of ctx.sessionManager.getEntries()) {
		if ((e as any)?.type !== "custom") continue;
		if ((e as any)?.customType !== SKILL_LOADED_ENTRY) continue;
		const data = (e as any)?.data as SkillLoadedEntryData | undefined;
		if (data?.name) out.add(data.name);
	}
	return out;
}

function appendSkillLoadNote(pi: ExtensionAPI, message: string): void {
	pi.appendEntry<SkillLoadNoteEntryData>(SKILL_LOAD_NOTE_ENTRY, { message });
}

function getSkillLoadNotesFromSession(ctx: ExtensionContext): string[] {
	const notes = new Set<string>();
	for (const e of ctx.sessionManager.getEntries()) {
		if ((e as any)?.type !== "custom") continue;
		if ((e as any)?.customType !== SKILL_LOAD_NOTE_ENTRY) continue;
		const data = (e as any)?.data as SkillLoadNoteEntryData | undefined;
		if (data?.message) notes.add(data.message);
	}
	return Array.from(notes).sort((a, b) => a.localeCompare(b));
}

function readUsageNumber(source: any, keys: string[]): { value: number; status: "ok" | "missing" | "invalid" } {
	if (!source || typeof source !== "object") return { value: 0, status: "missing" };
	for (const key of keys) {
		if (!(key in source)) continue;
		const raw = source[key];
		const numeric = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
		if (Number.isFinite(numeric)) return { value: numeric, status: "ok" };
		return { value: 0, status: "invalid" };
	}
	return { value: 0, status: "missing" };
}

function extractCostTotal(usage: any): { value: number; status: "ok" | "missing" | "invalid" } {
	if (!usage) return { value: 0, status: "missing" };
	const directCost = readUsageNumber(usage, ["cost"]);
	if (directCost.status !== "missing") return directCost;
	const cost = usage?.cost;
	if (!cost || typeof cost !== "object") return { value: 0, status: "missing" };
	const totalCost = readUsageNumber(cost, ["total"]);
	if (totalCost.status !== "missing") return totalCost;

	const components = ["input", "output", "cacheRead", "cacheWrite"].map((key) => readUsageNumber(cost, [key]));
	if (components.every((component) => component.status === "missing")) {
		return { value: 0, status: "missing" };
	}
	if (components.some((component) => component.status === "invalid")) {
		return { value: 0, status: "invalid" };
	}
	return {
		value: components.reduce((sum, component) => sum + component.value, 0),
		status: "ok",
	};
}

function sumSessionUsage(ctx: ExtensionCommandContext): {
	totalTokens: number;
	totalCost: number;
	isPartial: boolean;
	note: string | null;
} {
	let input = 0;
	let output = 0;
	let cacheRead = 0;
	let cacheWrite = 0;
	let totalCost = 0;
	let isPartial = false;

	for (const entry of ctx.sessionManager.getEntries()) {
		if ((entry as any)?.type !== "message") continue;
		const msg = (entry as any)?.message;
		if (!msg || msg.role !== "assistant") continue;
		const usage = msg.usage;
		if (!usage) continue;

		const inputUsage = readUsageNumber(usage, ["input", "inputTokens"]);
		const outputUsage = readUsageNumber(usage, ["output", "outputTokens"]);
		const cacheReadUsage = readUsageNumber(usage, ["cacheRead"]);
		const cacheWriteUsage = readUsageNumber(usage, ["cacheWrite"]);
		const costUsage = extractCostTotal(usage);

		input += inputUsage.value;
		output += outputUsage.value;
		cacheRead += cacheReadUsage.value;
		cacheWrite += cacheWriteUsage.value;
		totalCost += costUsage.value;

		if (
			inputUsage.status === "invalid" ||
			outputUsage.status === "invalid" ||
			cacheReadUsage.status === "invalid" ||
			cacheWriteUsage.status === "invalid" ||
			costUsage.status === "invalid"
		) {
			isPartial = true;
			continue;
		}
		if (
			inputUsage.status === "missing" &&
			outputUsage.status === "missing" &&
			cacheReadUsage.status === "missing" &&
			cacheWriteUsage.status === "missing" &&
			costUsage.status !== "ok"
		) {
			isPartial = true;
		}
	}

	return {
		totalTokens: input + output + cacheRead + cacheWrite,
		totalCost,
		isPartial,
		note: isPartial ? "usage data was partially unavailable or invalid for one or more assistant messages" : null,
	};
}

function shortenPath(p: string, cwd: string): string {
	const rp = path.resolve(p);
	const rc = path.resolve(cwd);
	if (rp === rc) return ".";
	if (rp.startsWith(rc + path.sep)) return "./" + rp.slice(rc.length + 1);
	return rp;
}

function renderUsageBar(
	theme: any,
	parts: { system: number; tools: number; convo: number; remaining: number },
	total: number,
	width: number,
): string {
	const w = Math.max(10, width);
	if (total <= 0) return "";

	const toCols = (n: number) => Math.round((n / total) * w);
	let sys = toCols(parts.system);
	let tools = toCols(parts.tools);
	let con = toCols(parts.convo);
	let rem = w - sys - tools - con;
	if (rem < 0) rem = 0;
	// adjust rounding drift
	while (sys + tools + con + rem < w) rem++;
	while (sys + tools + con + rem > w && rem > 0) rem--;

	const block = "█";
	const sysStr = theme.fg("accent", block.repeat(sys));
	const toolsStr = theme.fg("warning", block.repeat(tools));
	const conStr = theme.fg("success", block.repeat(con));
	const remStr = theme.fg("dim", block.repeat(rem));
	return `${sysStr}${toolsStr}${conStr}${remStr}`;
}

function joinComma(items: string[]): string {
	return items.join(", ");
}

function joinCommaStyled(items: string[], renderItem: (item: string) => string, sep: string): string {
	return items.map(renderItem).join(sep);
}

type ContextViewData = {
	usage:
		| {
				// message-based context usage estimate from ctx.getContextUsage()
				messageTokens: number | null;
				contextWindow: number | null;
				// effective usage incl. a rough tool-definition estimate
				effectiveTokens: number | null;
				percent: number | null;
				remainingTokens: number | null;
			}
			| null;
	systemPromptTokens: number | null;
	toolsTokens: number;
	activeTools: number;
	agentFiles: string[];
	agentFilesSummary: string;
	agentFileDiagnostics: string[];
	discoveredAgentFileCount: number;
	agentScanRoot: string;
	agentTokenSummary: string;
	extensions: string[];
	skills: string[];
	loadedSkills: string[];
	skillNotes: string[];
	session: { totalTokens: number; totalCost: number; isPartial: boolean; note: string | null };
};

class ContextView implements Component {
	private tui: TUI;
	private theme: any;
	private onDone: () => void;
	private data: ContextViewData;
	private container: Container;
	private body: Text;
	private cachedWidth?: number;

	constructor(tui: TUI, theme: any, data: ContextViewData, onDone: () => void) {
		this.tui = tui;
		this.theme = theme;
		this.data = data;
		this.onDone = onDone;

		this.container = new Container();
		this.container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
		this.container.addChild(
			new Text(
				theme.fg("accent", theme.bold("Context")) + theme.fg("dim", "  (Esc/q/Enter to close)"),
				1,
				0,
			),
		);
		this.container.addChild(new Text("", 1, 0));

		this.body = new Text("", 1, 0);
		this.container.addChild(this.body);

		this.container.addChild(new Text("", 1, 0));
		this.container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
	}

	private rebuild(width: number): void {
		const muted = (s: string) => this.theme.fg("muted", s);
		const dim = (s: string) => this.theme.fg("dim", s);
		const text = (s: string) => this.theme.fg("text", s);

		const lines: string[] = [];

		// Window + bar
		const usage = this.data.usage;
		const hasWindowEstimate =
			usage?.messageTokens != null &&
			usage?.contextWindow != null &&
			usage?.effectiveTokens != null &&
			usage?.percent != null &&
			usage?.remainingTokens != null;
		if (!hasWindowEstimate) {
			lines.push(muted("Window: ") + dim("(unknown)"));
		} else {
			const u = usage!;
			lines.push(
				muted("Window: ") +
					text(`~${u.effectiveTokens.toLocaleString()} / ${u.contextWindow.toLocaleString()}`) +
					muted(`  (${u.percent.toFixed(1)}% used, ~${u.remainingTokens.toLocaleString()} left)`),
			);

				// bar width tries to fit within the viewport
				const barWidth = Math.max(10, Math.min(36, width - 10));

				// Prorate system prompt into current message context estimate, then add tools estimate.
				const sysInMessages = Math.min(this.data.systemPromptTokens ?? 0, u.messageTokens);
				const convoInMessages = Math.max(0, u.messageTokens - sysInMessages);
				const bar =
					renderUsageBar(
						this.theme,
						{
							system: sysInMessages,
							tools: this.data.toolsTokens,
							convo: convoInMessages,
							remaining: u.remainingTokens,
						},
					u.contextWindow,
					barWidth,
				) +
				" " +
				dim("sys") +
				this.theme.fg("accent", "█") +
				" " +
				dim("tools") +
				this.theme.fg("warning", "█") +
				" " +
				dim("convo") +
				this.theme.fg("success", "█") +
				" " +
				dim("free") +
				this.theme.fg("dim", "█");
			lines.push(bar);
		}

		lines.push("");

		// System prompt + tools totals (approx)
		const systemSummary =
			this.data.systemPromptTokens == null ? "unknown" : `~${this.data.systemPromptTokens.toLocaleString()} tok`;
		lines.push(
			muted("System: ") +
				text(systemSummary) +
				muted(` (AGENTS ${this.data.agentTokenSummary})`),
		);
		lines.push(
			muted("Tools: ") +
				text(`~${this.data.toolsTokens.toLocaleString()} tok`) +
				muted(` (${this.data.activeTools} active)`),
		);

		const agentCountLabel =
			this.data.discoveredAgentFileCount === this.data.agentFiles.length
				? `${this.data.agentFiles.length}`
				: `${this.data.agentFiles.length} confirmed loaded / ${this.data.discoveredAgentFileCount} discovered`;
		lines.push(muted(`AGENTS (${agentCountLabel}, agent dir ${this.data.agentScanRoot}): `) + text(this.data.agentFilesSummary));
		for (const diagnostic of this.data.agentFileDiagnostics) {
			lines.push(dim(`AGENTS note: ${diagnostic}`));
		}
		lines.push("");
			lines.push(muted(`Extensions (${this.data.extensions.length}): `) + text(this.data.extensions.length ? joinComma(this.data.extensions) : "(none)"));

			const loaded = new Set(this.data.loadedSkills);
			const skillsRendered = this.data.skills.length
			? joinCommaStyled(
					this.data.skills,
					(name) => (loaded.has(name) ? this.theme.fg("success", name) : this.theme.fg("muted", name)),
					this.theme.fg("muted", ", "),
				)
				: "(none)";
			lines.push(muted(`Skills (${this.data.skills.length}): `) + skillsRendered);
			for (const note of this.data.skillNotes) {
				lines.push(dim(`Skills note: ${note}`));
			}
			lines.push("");
			const sessionSummary = this.data.session.isPartial
				? this.data.session.totalTokens > 0 || this.data.session.totalCost > 0
					? `${this.data.session.totalTokens.toLocaleString()}+ tokens · ${formatUsd(this.data.session.totalCost)}+`
					: "unknown"
				: `${this.data.session.totalTokens.toLocaleString()} tokens · ${formatUsd(this.data.session.totalCost)}`;
			lines.push(muted("Session: ") + text(sessionSummary));
			if (this.data.session.note) {
				lines.push(dim(`Session note: ${this.data.session.note}`));
			}

		this.body.setText(lines.join("\n"));
		this.cachedWidth = width;
	}

	handleInput(data: string): void {
		if (
			matchesKey(data, Key.escape) ||
			matchesKey(data, Key.ctrl("c")) ||
			data.toLowerCase() === "q" ||
			data === "\r"
		) {
			this.onDone();
			return;
		}
	}

	invalidate(): void {
		this.container.invalidate();
		this.cachedWidth = undefined;
	}

	render(width: number): string[] {
		if (this.cachedWidth !== width) this.rebuild(width);
		return this.container.render(width);
	}
}

export default function contextExtension(pi: ExtensionAPI) {
	// Track which skills were actually pulled in via read tool calls.
	let lastSessionId: string | null = null;
	let cachedLoadedSkills = new Set<string>();
	let cachedSkillIndex: SkillIndexEntry[] = [];

		const ensureCaches = (ctx: ExtensionContext) => {
			const rebuildSkillIndex = () => {
				const indexed = buildSkillIndex(pi, ctx.cwd);
				cachedSkillIndex = indexed.entries;
				for (const diagnostic of indexed.diagnostics) {
					appendSkillLoadNote(pi, diagnostic);
				}
			};
			const sid = ctx.sessionManager.getSessionId();
			if (sid !== lastSessionId) {
				lastSessionId = sid;
				cachedLoadedSkills = getLoadedSkillsFromSession(ctx);
				rebuildSkillIndex();
			}
			if (cachedSkillIndex.length === 0) {
				rebuildSkillIndex();
			}
		};

	const matchSkillForPath = (absPath: string): string | null => {
		let best: SkillIndexEntry | null = null;
		for (const s of cachedSkillIndex) {
			if (!s.skillDir) continue;
			if (absPath === s.skillFilePath || absPath.startsWith(s.skillDir + path.sep)) {
				if (!best || s.skillDir.length > best.skillDir.length) best = s;
			}
		}
		return best?.name ?? null;
	};

		pi.on("tool_result", (event: ToolResultEvent, ctx: ExtensionContext) => {
			// Only count successful reads.
			if ((event as any).toolName !== "read") return;
			if ((event as any).isError) return;

			const input = (event as any).input as { path?: unknown } | undefined;
			const p = typeof input?.path === "string" ? input.path : "";
			if (!p) return;

			ensureCaches(ctx);
			const resolved = resolveReadPathForTracking(p, ctx.cwd);
			if (resolved.diagnostic) {
				appendSkillLoadNote(pi, resolved.diagnostic);
				return;
			}
			const abs = resolved.path;
			if (!abs) return;
			const skillName = matchSkillForPath(abs);
			if (!skillName) return;

		if (!cachedLoadedSkills.has(skillName)) {
			cachedLoadedSkills.add(skillName);
			pi.appendEntry<SkillLoadedEntryData>(SKILL_LOADED_ENTRY, { name: skillName, path: abs });
		}
	});

	pi.registerCommand("context", {
		description: "Show loaded context overview",
		handler: async (_args, ctx: ExtensionCommandContext) => {
			const commands = pi.getCommands();
			const extensionCmds = commands.filter((c) => c.source === "extension");
			const skillCmds = commands.filter((c) => c.source === "skill");

			const extensionFiles = Array.from(new Set(extensionCmds.map((c) => formatCommandSourcePath(c, ctx.cwd)))).sort((a, b) =>
				a.localeCompare(b),
			);

			const skills = skillCmds
				.map((c) => normalizeSkillName(c.name))
				.sort((a, b) => a.localeCompare(b));

			const discoveredAgentFiles = await loadProjectContextFiles(ctx.cwd);
			const systemPrompt = ctx.getSystemPrompt();
			const agentFileSummary = summarizeLoadedContextFiles(discoveredAgentFiles, systemPrompt);
			const agentFiles = agentFileSummary.files;
			const agentFilePaths = agentFiles.map((f) => shortenPath(f.path, ctx.cwd));
			const unmatchedAgentFiles = agentFileSummary.discoveredCount - agentFiles.length;
			const agentFilesSummary =
				agentFiles.length === 0
					? agentFileSummary.summary
					: unmatchedAgentFiles > 0
						? `${joinComma(agentFilePaths)} (+${unmatchedAgentFiles} unverified)`
						: joinComma(agentFilePaths);
			const agentFileDiagnostics = discoveredAgentFiles.errors.map(
				(entry) => `discovery failed for ${shortenPath(entry.path, ctx.cwd)}: ${entry.error}`,
			);
			const agentTokens = agentFiles.reduce((a, f) => a + f.tokens, 0);
			const agentTokenSummary =
				agentFileSummary.verificationMode === "verified" &&
				agentFileSummary.discoveredCount === agentFiles.length &&
				agentFileDiagnostics.length === 0
					? `~${agentTokens.toLocaleString()}`
					: agentFiles.length > 0
						? `verified-only ~${agentTokens.toLocaleString()}`
						: "unknown";
			const systemPromptTokens = systemPrompt ? estimateTokens(systemPrompt) : null;
			const systemPromptTokenSummary =
				systemPromptTokens == null ? "unknown" : `~${systemPromptTokens.toLocaleString()} tok`;
			const agentScanRoot = shortenPath(getAgentDir(), ctx.cwd);

			const usage = ctx.getContextUsage();
			const messageTokens = typeof usage?.tokens === "number" ? usage.tokens : null;
			const ctxWindow = typeof usage?.contextWindow === "number" && usage.contextWindow > 0 ? usage.contextWindow : null;
			const usagePercent = typeof usage?.percent === "number" ? usage.percent : null;

			// Tool definitions are not part of ctx.getContextUsage() (it estimates message tokens).
			// We approximate their token impact from tool name + description, and apply a fudge
			// factor to account for parameters/schema/formatting.
			const TOOL_FUDGE = 1.5;
			const activeToolNames = pi.getActiveTools();
			const toolInfoByName = new Map(pi.getAllTools().map((t) => [t.name, t] as const));
			let toolsTokens = 0;
			for (const name of activeToolNames) {
				const info = toolInfoByName.get(name);
				const blob = `${name}\n${info?.description ?? ""}`;
				toolsTokens += estimateTokens(blob);
			}
			toolsTokens = Math.round(toolsTokens * TOOL_FUDGE);

			const hasWindowEstimate = messageTokens != null && ctxWindow != null && usagePercent != null;
			const effectiveTokens = hasWindowEstimate ? messageTokens + toolsTokens : null;
			const percent = hasWindowEstimate ? (effectiveTokens / ctxWindow) * 100 : null;
			const remainingTokens = hasWindowEstimate ? Math.max(0, ctxWindow - effectiveTokens) : null;

			const sessionUsage = sumSessionUsage(ctx);

			const makePlainText = () => {
				const lines: string[] = [];
				lines.push("Context");
				if (hasWindowEstimate && effectiveTokens != null && percent != null && remainingTokens != null && ctxWindow != null) {
					lines.push(
						`Window: ~${effectiveTokens.toLocaleString()} / ${ctxWindow.toLocaleString()} (${percent.toFixed(1)}% used, ~${remainingTokens.toLocaleString()} left)`,
					);
				} else {
					lines.push("Window: (unknown)");
				}
				lines.push(`System: ${systemPromptTokenSummary} (AGENTS ${agentTokenSummary})`);
				lines.push(`Tools: ~${toolsTokens.toLocaleString()} tok (${activeToolNames.length} active)`);
				const agentCountLabel =
					agentFileSummary.discoveredCount === agentFiles.length
						? `${agentFiles.length}`
						: `${agentFiles.length} confirmed loaded / ${agentFileSummary.discoveredCount} discovered`;
				lines.push(`AGENTS (${agentCountLabel}, agent dir ${agentScanRoot}): ${agentFilesSummary}`);
				for (const diagnostic of agentFileDiagnostics) {
					lines.push(`AGENTS note: ${diagnostic}`);
				}
				lines.push(`Extensions (${extensionFiles.length}): ${extensionFiles.length ? joinComma(extensionFiles) : "(none)"}`);
				lines.push(`Skills (${skills.length}): ${skills.length ? joinComma(skills) : "(none)"}`);
				for (const note of getSkillLoadNotesFromSession(ctx)) {
					lines.push(`Skills note: ${note}`);
				}
				const sessionSummary = sessionUsage.isPartial
					? sessionUsage.totalTokens > 0 || sessionUsage.totalCost > 0
						? `${sessionUsage.totalTokens.toLocaleString()}+ tokens · ${formatUsd(sessionUsage.totalCost)}+`
						: "unknown"
					: `${sessionUsage.totalTokens.toLocaleString()} tokens · ${formatUsd(sessionUsage.totalCost)}`;
				lines.push(`Session: ${sessionSummary}`);
				if (sessionUsage.note) {
					lines.push(`Session note: ${sessionUsage.note}`);
				}
				return lines.join("\n");
			};

				if (!ctx.hasUI) {
					pi.sendMessage({ customType: "context", content: makePlainText(), display: true }, { triggerTurn: false });
					return;
				}

				const loadedSkills = Array.from(getLoadedSkillsFromSession(ctx)).sort((a, b) => a.localeCompare(b));
				const skillNotes = getSkillLoadNotesFromSession(ctx);

				const viewData: ContextViewData = {
					usage: usage
						? {
							messageTokens,
							contextWindow: ctxWindow,
							effectiveTokens,
							percent,
							remainingTokens,
						}
						: null,
					systemPromptTokens,
					toolsTokens,
					activeTools: activeToolNames.length,
					agentFiles: agentFilePaths,
					agentFilesSummary,
					agentFileDiagnostics,
					discoveredAgentFileCount: agentFileSummary.discoveredCount,
					agentScanRoot,
					agentTokenSummary,
					extensions: extensionFiles,
					skills,
					loadedSkills,
					skillNotes,
					session: {
						totalTokens: sessionUsage.totalTokens,
						totalCost: sessionUsage.totalCost,
						isPartial: sessionUsage.isPartial,
						note: sessionUsage.note,
					},
				};

			await ctx.ui.custom<void>((tui, theme, _kb, done) => {
				return new ContextView(tui, theme, viewData, done);
			});
		},
	});
}
