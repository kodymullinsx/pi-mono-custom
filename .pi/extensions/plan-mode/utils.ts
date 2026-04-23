/**
 * Pure utility functions for plan mode.
 * Extracted for testability.
 */

import { randomBytes } from "node:crypto";
import path from "node:path";

const DESTRUCTIVE_PATTERNS = [
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,
	/(^|[^<])>(?!>)/,
	/>>/,
	/\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
	/\byarn\s+(add|remove|install|publish)/i,
	/\bpnpm\s+(add|remove|install|publish)/i,
	/\bpip\s+(install|uninstall)/i,
	/\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
	/\bbrew\s+(install|uninstall|upgrade)/i,
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
	/\bsudo\b/i,
	/\bsu\b/i,
	/\bkill\b/i,
	/\bpkill\b/i,
	/\bkillall\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)/i,
	/\bservice\s+\S+\s+(start|stop|restart)/i,
	/\b(vim?|nano|emacs|code|subl)\b/i,
	/\bcurl\s.*(-o|--output|-O\b)/i,
	/\|\s*(bash|sh|zsh|python[23]?|node|ruby|perl)\b/i,
];

const SAFE_PATTERNS = [
	/^\s*cat\b/,
	/^\s*head\b/,
	/^\s*tail\b/,
	/^\s*less\b/,
	/^\s*more\b/,
	/^\s*grep\b/,
	/^\s*find\b/,
	/^\s*ls\b/,
	/^\s*pwd\b/,
	/^\s*echo\b/,
	/^\s*printf\b/,
	/^\s*wc\b/,
	/^\s*sort\b/,
	/^\s*uniq\b/,
	/^\s*diff\b/,
	/^\s*file\b/,
	/^\s*stat\b/,
	/^\s*du\b/,
	/^\s*df\b/,
	/^\s*tree\b/,
	/^\s*which\b/,
	/^\s*whereis\b/,
	/^\s*type\b/,
	/^\s*env\b/,
	/^\s*printenv\b/,
	/^\s*uname\b/,
	/^\s*whoami\b/,
	/^\s*id\b/,
	/^\s*date\b/,
	/^\s*cal\b/,
	/^\s*uptime\b/,
	/^\s*ps\b/,
	/^\s*top\b/,
	/^\s*htop\b/,
	/^\s*free\b/,
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
	/^\s*git\s+ls-/i,
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
	/^\s*yarn\s+(list|info|why|audit)/i,
	/^\s*node\s+--version/i,
	/^\s*python\s+--version/i,
	/^\s*curl\s(?!.*(-X\s*(POST|PUT|DELETE|PATCH)\b|--data\b|-d\s|--upload-file\b|-T\s))/i,
	/^\s*wget\s+-O\s*-/i,
	/^\s*jq\b/,
	/^\s*sed\b(?!.*(\s-[a-zA-Z]*i\b|--in-place\b))/i,
	/^\s*awk\b/,
	/^\s*rg\b/,
	/^\s*fd\b/,
	/^\s*bat\b/,
	/^\s*exa\b/,
];

const SECTION_HEADERS = ["Context", "Objective", "Approach", "Files to Modify", "Steps", "Risks", "Verification"] as const;
const TITLE_HEADER_PATTERN = /^\s*#{1,6}\s+(.+?)\s*$/;
const TITLE_BREAK_PATTERN =
	/\b(?:so that|because|instead of|rather than|which|that|since|while|when|after|before|where|as all|as it's)\b/i;
const REQUEST_PREFIX_PATTERNS = [
	/^\s*\/\w+\b\s*/i,
	/^\s*(?:please\s+)?(?:can|could|would)\s+you\s+/i,
	/^\s*(?:i\s+(?:need|want|would like)\s+you\s+to|help\s+me(?:\s+to)?\s+|let'?s\s+)/i,
] as const;
const ACTION_OBJECT_PATTERN =
	/\b(?:address|add|build|create|debug|design|fix|implement|investigate|migrate|optimize|redesign|refactor|remove|rewrite|update)\b\s+(.+)/i;
const LEADING_ARTICLE_PATTERN = /^(?:the|a|an|my|your|this|that|these|those|new|actual|real|current|existing)\s+/i;
const TITLE_ENTITY_CAPTURE_PATTERN =
	/^(.+?\b(tool|extension|command|workflow|prompt|provider|integration|hook))\b(?:\s+(?:for|in|on|with|across|via)\b.*)?$/i;
const TITLE_ENTITY_PLAN_PATTERN = /\b(tool|extension|command|workflow|prompt|provider|integration|hook)\b$/i;
const PLAN_SLUG_ADJECTIVES = [
	"ancient",
	"async",
	"binary",
	"bubbly",
	"calm",
	"clever",
	"composed",
	"cozy",
	"crispy",
	"curious",
	"deep",
	"dreamy",
	"eager",
	"elegant",
	"fluttering",
	"gentle",
	"jolly",
	"lively",
	"lucky",
	"luminous",
	"magical",
	"mellow",
	"mighty",
	"quiet",
	"quirky",
	"resilient",
	"silly",
	"smooth",
	"snuggly",
	"sorted",
	"squishy",
	"toasty",
	"typed",
	"valiant",
	"velvety",
	"warm",
	"wiggly",
	"wild",
	"wobbly",
	"wondrous",
] as const;
const PLAN_SLUG_VERBS = [
	"beaming",
	"churning",
	"discovering",
	"exploring",
	"finding",
	"fluttering",
	"gathering",
	"honking",
	"hugging",
	"humming",
	"jumping",
	"launching",
	"meandering",
	"moseying",
	"napping",
	"nibbling",
	"painting",
	"percolating",
	"plotting",
	"purring",
	"puzzling",
	"questing",
	"riding",
	"rolling",
	"seeking",
	"shimmying",
	"singing",
	"stirring",
	"strolling",
	"swinging",
	"tumbling",
	"watching",
	"weaving",
	"wiggling",
	"wondering",
] as const;
const PLAN_SLUG_NOUNS = [
	"abelson",
	"beaver",
	"book",
	"brook",
	"cake",
	"castle",
	"cat",
	"cherny",
	"cocke",
	"crab",
	"cupcake",
	"dewdrop",
	"glade",
	"harbor",
	"kitten",
	"marshmallow",
	"mccarthy",
	"meadow",
	"music",
	"origami",
	"pascal",
	"patterson",
	"penguin",
	"phoenix",
	"pizza",
	"rabin",
	"raccoon",
	"riddle",
	"shell",
	"sifakis",
	"sloth",
	"sparrow",
	"stonebraker",
	"taco",
	"tide",
	"trinket",
	"ullman",
	"valiant",
] as const;
const LEGACY_PLAN_HEADER_PATTERN = /(?:^|\n)\*{0,2}Plan:\*{0,2}\s*\n/i;
const NUMBERED_STEP_PATTERN = /^\s*(\d+)[.)]\s+(.+)$/gm;
const STEP_MARKUP_PATTERN = /\*{1,2}([^*]+)\*{1,2}/g;
const STEP_CODE_PATTERN = /`([^`]+)`/g;
const STEP_LEADING_VERB_PATTERN =
	/^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i;
const TRAILING_STEP_MARKUP_PATTERN = /\*{1,2}$/;
const MIN_RAW_STEP_LENGTH = 5;
const MIN_CLEAN_STEP_LENGTH = 3;
const SKIPPED_STEP_PREFIXES = new Set(["`", "/", "-"]);
const GENERIC_PLAN_TITLES = new Set([
	"plan",
	"raw plan",
	"plan quality checklist",
	...SECTION_HEADERS.map((header) => header.toLowerCase()),
]);

type SectionHeader = (typeof SECTION_HEADERS)[number];

export interface TodoItem {
	step: number;
	text: string;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createSectionHeaderPatterns(header: string): RegExp[] {
	const escaped = escapeRegExp(header);
	return [
		new RegExp(`^\\s{0,3}#{1,6}\\s+${escaped}\\s*:?\\s*$`, "i"),
		new RegExp(`^\\s*\\*{1,2}${escaped}:?\\*{0,2}\\s*$`, "i"),
		new RegExp(`^\\s*${escaped}:\\s*$`, "i"),
	];
}

const SECTION_HEADER_PATTERNS = new Map<SectionHeader, RegExp[]>(
	SECTION_HEADERS.map((header) => [header, createSectionHeaderPatterns(header)]),
);

function getSectionHeaderPatterns(header: string): RegExp[] {
	return SECTION_HEADER_PATTERNS.get(header as SectionHeader) ?? createSectionHeaderPatterns(header);
}

function isSectionHeader(line: string, header: string): boolean {
	return getSectionHeaderPatterns(header).some((pattern) => pattern.test(line));
}

function findSectionStart(lines: string[], header: string): number {
	return lines.findIndex((line) => isSectionHeader(line, header));
}

function findNextSectionStart(lines: string[], startIndex: number): number {
	for (let index = startIndex + 1; index < lines.length; index += 1) {
		if (SECTION_HEADERS.some((header) => isSectionHeader(lines[index], header))) {
			return index;
		}
	}
	return -1;
}

function randomInt(max: number): number {
	const bytes = randomBytes(4);
	return bytes.readUInt32BE(0) % max;
}

function pickRandom<T>(values: readonly T[]): T {
	return values[randomInt(values.length)] as T;
}

function shouldSkipStepText(text: string): boolean {
	if (text.length <= MIN_RAW_STEP_LENGTH) return true;
	return SKIPPED_STEP_PREFIXES.has(text[0] ?? "");
}

export function isSafeCommand(command: string): boolean {
	if (DESTRUCTIVE_PATTERNS.some((pattern) => pattern.test(command))) return false;
	return SAFE_PATTERNS.some((pattern) => pattern.test(command));
}

export function generatePlanSlug(): string {
	const adjective = pickRandom(PLAN_SLUG_ADJECTIVES);
	const verb = pickRandom(PLAN_SLUG_VERBS);
	const noun = pickRandom(PLAN_SLUG_NOUNS);
	return `${adjective}-${verb}-${noun}`;
}

export function cleanStepText(text: string): string {
	let cleaned = text
		.replace(STEP_MARKUP_PATTERN, "$1")
		.replace(STEP_CODE_PATTERN, "$1")
		.replace(STEP_LEADING_VERB_PATTERN, "")
		.replace(/\s+/g, " ")
		.trim();

	if (!cleaned) return cleaned;
	return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normalizeTitleCandidate(value: string): string {
	return value
		.replace(/^plan\s*:\s*/i, "")
		.replace(/[*_`#]/g, " ")
		.replace(/["“”'‘’]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/[.:;!?]+$/, "")
		.trim();
}

function isGenericPlanTitle(value: string): boolean {
	return GENERIC_PLAN_TITLES.has(normalizeTitleCandidate(value).toLowerCase());
}

function formatTitleToken(token: string): string {
	if (!token) return token;
	if (/[a-z][A-Z]|[A-Z]{2,}/.test(token)) return token;
	return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function titleCase(value: string): string {
	return value
		.split(/\s+/)
		.filter(Boolean)
		.map((token) => token.split("-").map((part) => formatTitleToken(part)).join("-"))
		.join(" ");
}

function normalizeInlinePaths(text: string): string {
	return text.replace(/\/[\w./-]+/g, (match) => {
		const baseName = path.basename(match);
		if (!baseName) return match;
		return baseName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
	});
}

function stripRequestPrefixes(text: string): string {
	let cleaned = text.trim();
	for (const pattern of REQUEST_PREFIX_PATTERNS) {
		cleaned = cleaned.replace(pattern, "");
	}
	return cleaned.trim();
}

function trimBeforeBreak(text: string): string {
	const match = text.match(TITLE_BREAK_PATTERN);
	if (match?.index === undefined) return text.trim();
	return text.slice(0, match.index).trim();
}

function shortenTitle(text: string, maxWords = 6): string {
	return text
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, maxWords)
		.join(" ");
}

function extractNamedEntity(text: string): string | null {
	const codeMatch = text.match(/`([^`]+)`/);
	if (codeMatch?.[1]) {
		const candidate = normalizeTitleCandidate(codeMatch[1].replace(/[-_]+/g, " "));
		return candidate ? titleCase(candidate) : null;
	}

	const pathMatch = text.match(/\/[\w./-]+/);
	if (!pathMatch?.[0]) return null;

	const baseName = path.basename(pathMatch[0]).replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
	const candidate = normalizeTitleCandidate(baseName);
	return candidate ? titleCase(candidate) : null;
}

export function extractExplicitPlanTitle(message: string): string | null {
	const lines = message.split(/\r?\n/);
	const firstSectionIndex = lines.findIndex((line) => SECTION_HEADERS.some((header) => isSectionHeader(line, header)));
	if (firstSectionIndex <= 0) return null;

	const prefixLines = lines
		.slice(0, firstSectionIndex)
		.map((line) => line.trim())
		.filter(Boolean);
	if (prefixLines.length === 0 || prefixLines.length > 2) return null;

	const titleLine = prefixLines[0];
	const headingMatch = titleLine.match(TITLE_HEADER_PATTERN);
	if (!headingMatch && /[.:]$/.test(titleLine)) return null;

	const candidate = normalizeTitleCandidate(headingMatch?.[1] ?? titleLine);
	if (!candidate || isGenericPlanTitle(candidate)) return null;
	return titleCase(candidate);
}

export function derivePlanTitle(sourceText: string): string | null {
	let cleaned = normalizeInlinePaths(sourceText).replace(/`([^`]+)`/g, "$1");
	cleaned = stripRequestPrefixes(cleaned);
	cleaned = cleaned
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find(Boolean) ?? cleaned.trim();
	if (!cleaned) return null;

	const namedEntity = extractNamedEntity(sourceText);
	if (namedEntity && /\btool\b/i.test(cleaned)) return `${namedEntity} Tool Plan`;
	if (namedEntity && /\bextension\b/i.test(cleaned)) return `${namedEntity} Extension Plan`;
	if (namedEntity && /\bcommand\b/i.test(cleaned)) return `${namedEntity} Command Plan`;
	if (/\bplan(?:ning)? mode\b/i.test(cleaned) && /\btitl(?:e|es|ing)\b/i.test(cleaned)) {
		return "Plan Mode Titles";
	}

	const actionMatch = cleaned.match(ACTION_OBJECT_PATTERN);
	let phrase = actionMatch?.[1] ?? cleaned;
	phrase = trimBeforeBreak(phrase);
	phrase = (phrase.split(/[.?!]/)[0] ?? phrase).replace(/\([^)]*\)/g, " ");
	phrase = phrase.replace(/\b(?:for|of)\s+the\s+plans?\b/i, "");
	phrase = phrase.replace(LEADING_ARTICLE_PATTERN, "").replace(/\s+/g, " ").trim();
	if (!phrase) return null;

	const entityPhraseMatch = phrase.match(TITLE_ENTITY_CAPTURE_PATTERN);
	if (entityPhraseMatch?.[1]) {
		return `${titleCase(entityPhraseMatch[1])} Plan`;
	}

	let title = titleCase(shortenTitle(phrase));
	if (!title || isGenericPlanTitle(title)) return null;
	if (TITLE_ENTITY_PLAN_PATTERN.test(title) && !/\bplan\b$/i.test(title)) {
		title = `${title} Plan`;
	}
	return title;
}

export function extractSection(planText: string, header: string): string | null {
	const lines = planText.split(/\r?\n/);
	const startIndex = findSectionStart(lines, header);
	if (startIndex < 0) return null;

	const endIndex = findNextSectionStart(lines, startIndex);
	const content = lines.slice(startIndex + 1, endIndex >= 0 ? endIndex : undefined).join("\n").trim();
	return content.length > 0 ? content : null;
}

export function extractPlanText(message: string): string | null {
	const legacyHeaderMatch = message.match(LEGACY_PLAN_HEADER_PATTERN);
	if (legacyHeaderMatch?.index !== undefined) {
		return message.slice(legacyHeaderMatch.index).trim();
	}

	const lines = message.split(/\r?\n/);
	const startIndex = lines.findIndex((line) => SECTION_HEADERS.some((header) => isSectionHeader(line, header)));
	if (startIndex < 0 || findSectionStart(lines, "Steps") < 0) return null;

	return lines.slice(startIndex).join("\n").trim();
}

function extractNumberedItems(sectionText: string): TodoItem[] {
	const items: TodoItem[] = [];

	for (const match of sectionText.matchAll(NUMBERED_STEP_PATTERN)) {
		const rawText = match[2].trim().replace(TRAILING_STEP_MARKUP_PATTERN, "").trim();
		if (shouldSkipStepText(rawText)) continue;

		const cleaned = cleanStepText(rawText);
		if (cleaned.length <= MIN_CLEAN_STEP_LENGTH) continue;

		items.push({ step: Number(match[1]), text: cleaned });
	}

	return items;
}

export function extractTodoItems(message: string): TodoItem[] {
	const stepsSection = extractSection(message, "Steps");
	if (stepsSection) {
		return extractNumberedItems(stepsSection);
	}

	const legacyHeaderMatch = message.match(LEGACY_PLAN_HEADER_PATTERN);
	if (legacyHeaderMatch?.index === undefined) return [];

	const startIndex = legacyHeaderMatch.index + legacyHeaderMatch[0].length;
	return extractNumberedItems(message.slice(startIndex));
}
