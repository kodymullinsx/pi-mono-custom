import type { ExtensionAPI, TruncationResult } from "@mariozechner/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
} from "@mariozechner/pi-coding-agent";
import { findInFiles, Lang, parse, type NapiConfig, type Range, type SgNode } from "@ast-grep/napi";
import { Type } from "@sinclair/typebox";
import {
  runAstDebugQuery as runCliAstDebugQuery,
  runAstProjectScan as runCliAstProjectScan,
  runAstRuleTest as runCliAstRuleTest,
  type AstDebugQueryResult,
  type AstProjectScanResult,
  type AstRuleTestResult,
  type DebugQueryFormat,
  type ProjectScanSeverityOverrides,
  type ReportStyle,
} from "./cli.ts";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const STRICTNESS_VALUES = ["cst", "smart", "ast", "relaxed", "signature", "template"] as const;
const CLI_LANGUAGE_HELP =
  "Language to parse. Accepts built-in ast-grep languages and config-defined custom languages.";

type Phase1LangKey = "JavaScript" | "TypeScript" | "Tsx" | "Html" | "Css";

interface Phase1LanguageSpec {
  key: Phase1LangKey;
  canonical: string;
  aliases: readonly string[];
}

const PHASE1_LANGUAGE_SPECS: readonly Phase1LanguageSpec[] = [
  { key: "JavaScript", canonical: "javascript", aliases: ["js", "javascript", "jsx", "mjs", "cjs"] },
  { key: "TypeScript", canonical: "typescript", aliases: ["ts", "typescript", "mts", "cts"] },
  { key: "Tsx", canonical: "tsx", aliases: ["tsx"] },
  { key: "Html", canonical: "html", aliases: ["html", "htm"] },
  { key: "Css", canonical: "css", aliases: ["css"] },
];

const LANGUAGE_ALIASES = new Map<string, Lang>(
  PHASE1_LANGUAGE_SPECS.flatMap((spec) => {
    if (!(spec.key in Lang)) {
      return [];
    }
    const lang = Lang[spec.key as keyof typeof Lang] as Lang;
    return spec.aliases.map((alias) => [alias, lang] as const);
  }),
);

const SUPPORTED_LANGUAGE_HELP = PHASE1_LANGUAGE_SPECS
  .filter((spec) => spec.key in Lang)
  .map((spec) => spec.canonical)
  .join(", ");

const MatcherSchema = Type.Object({
  pattern: Type.Optional(
    Type.String({
      description:
        "Simple ast-grep pattern string, for example console.log($ARG). Use this or matcher.context, not both.",
    }),
  ),
  context: Type.Optional(
    Type.String({
      description:
        "Pattern-object context snippet for ambiguous or partial matches. Use with an optional matcher.selector instead of matcher.pattern.",
    }),
  ),
  selector: Type.Optional(
    Type.String({
      description: "Optional named node kind selected from matcher.context, for example pair or call_expression.",
    }),
  ),
  strictness: Type.Optional(
    Type.String({
      description: `Optional pattern strictness for matcher.context: ${STRICTNESS_VALUES.join(", ")}.`,
    }),
  ),
  rule: Type.Optional(
    Type.Object({}, {
      additionalProperties: true,
      description: "Full ast-grep rule object for relational or composite rules.",
    }),
  ),
  constraints: Type.Optional(
    Type.Object({}, {
      additionalProperties: true,
      description: "Optional ast-grep constraints object. Only valid with matcher.rule.",
    }),
  ),
  utils: Type.Optional(
    Type.Object({}, {
      additionalProperties: true,
      description: "Optional ast-grep utility rules object. Only valid with matcher.rule.",
    }),
  ),
  transform: Type.Optional(
    Type.Object({}, {
      additionalProperties: true,
      description: "Optional ast-grep transform object. Transformed metavars are returned when available.",
    }),
  ),
});

const AstTestParamsSchema = Type.Object({
  language: Type.String({
    description: `Built-in NAPI language to parse. Supported canonical values: ${SUPPORTED_LANGUAGE_HELP}.`,
  }),
  snippet: Type.String({
    description: "Code snippet to test the matcher against.",
  }),
  matcher: MatcherSchema,
});

const AstFindParamsSchema = Type.Object({
  language: Type.String({
    description: `Built-in NAPI language to parse. Supported canonical values: ${SUPPORTED_LANGUAGE_HELP}.`,
  }),
  paths: Type.Array(
    Type.String({
      description: "Path to search. Relative paths resolve from the current working directory. Leading @ and ~ are allowed.",
    }),
    {
      minItems: 1,
      description: "One or more paths to search relative to the current working directory.",
    },
  ),
  matcher: MatcherSchema,
  languageGlobs: Type.Optional(
    Type.Array(
      Type.String({
        description: "Optional language glob, for example '*.ts' or '*.tsx'.",
      }),
      {
        minItems: 1,
        description: "Optional ast-grep language globs that narrow which files are parsed for the selected language.",
      },
    ),
  ),
});

const AstRewritePreviewParamsSchema = Type.Object({
  language: Type.String({
    description: `Built-in NAPI language to parse. Supported canonical values: ${SUPPORTED_LANGUAGE_HELP}.`,
  }),
  matcher: MatcherSchema,
  replacement: Type.String({
    description:
      "Replacement template for each match. Supports $NAME placeholders for single captures or transformed metavars. Preview only, never mutates files.",
  }),
  snippet: Type.Optional(
    Type.String({
      description: "Code snippet to rewrite. Provide this or path, but not both.",
    }),
  ),
  path: Type.Optional(
    Type.String({
      description: "File path to preview a rewrite against. Provide this or snippet, but not both.",
    }),
  ),
});

const AstDebugQueryParamsSchema = Type.Object({
  language: Type.String({
    description: CLI_LANGUAGE_HELP,
  }),
  query: Type.String({
    description: "Raw ast-grep query string to inspect with sg run --debug-query.",
  }),
  selector: Type.Optional(
    Type.String({
      description: "Optional node kind to extract from the debug query, matching sg run --selector.",
    }),
  ),
  strictness: Type.Optional(
    Type.String({
      description: `Optional query strictness for sg run --strictness: ${STRICTNESS_VALUES.join(", ")}.`,
    }),
  ),
  configPath: Type.Optional(
    Type.String({
      description: "Optional path to sgconfig.yml for config-aware debug-query runs, including custom languages.",
    }),
  ),
  format: Type.Optional(
    Type.Union([
      Type.Literal("pattern"),
      Type.Literal("ast"),
      Type.Literal("cst"),
      Type.Literal("sexp"),
    ], {
      description: "Debug output format. Defaults to pattern.",
    }),
  ),
});

const AstRuleTestParamsSchema = Type.Object({
  configPath: Type.Optional(
    Type.String({
      description: "Optional path to sgconfig.yml. If omitted, the tool discovers the nearest project config.",
    }),
  ),
  testDir: Type.Optional(
    Type.String({
      description: "Optional rule test directory to pass to sg test. Relative paths resolve from the current working directory.",
    }),
  ),
  snapshotDir: Type.Optional(
    Type.String({
      description: "Optional snapshot directory name passed through to sg test --snapshot-dir.",
    }),
  ),
  filter: Type.Optional(
    Type.String({
      description: "Optional regex filter for rule ids.",
    }),
  ),
  includeOff: Type.Optional(
    Type.Boolean({
      description: "Include severity: off rules in the test run.",
    }),
  ),
  skipSnapshotTests: Type.Optional(
    Type.Boolean({
      description: "Validate rule tests without checking stored snapshots.",
    }),
  ),
});

const SeverityOverridesSchema = Type.Object({
  error: Type.Optional(Type.Array(Type.String({ description: "Rule id to force to error severity." }))),
  warning: Type.Optional(Type.Array(Type.String({ description: "Rule id to force to warning severity." }))),
  info: Type.Optional(Type.Array(Type.String({ description: "Rule id to force to info severity." }))),
  hint: Type.Optional(Type.Array(Type.String({ description: "Rule id to force to hint severity." }))),
  off: Type.Optional(Type.Array(Type.String({ description: "Rule id to disable for this scan." }))),
});

const AstProjectScanParamsSchema = Type.Object({
  paths: Type.Optional(
    Type.Array(
      Type.String({
        description: "Path to scan. Relative paths resolve from the current working directory. Leading @ and ~ are allowed.",
      }),
      {
        minItems: 1,
        description: "Optional paths to scan. If omitted, the tool scans the discovered project root.",
      },
    ),
  ),
  configPath: Type.Optional(
    Type.String({
      description: "Optional path to sgconfig.yml. If omitted, the tool discovers the nearest project config from the scan paths.",
    }),
  ),
  filter: Type.Optional(
    Type.String({
      description: "Optional regex filter for rule ids.",
    }),
  ),
  reportStyle: Type.Optional(
    Type.Union([
      Type.Literal("rich"),
      Type.Literal("medium"),
      Type.Literal("short"),
    ], {
      description: "Diagnostic report style forwarded to sg scan. Defaults to rich.",
    }),
  ),
  maxResults: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Stop scanning after this many findings.",
    }),
  ),
  includeMetadata: Type.Optional(
    Type.Boolean({
      description: "Include rule metadata in the JSON findings.",
    }),
  ),
  severity: Type.Optional(SeverityOverridesSchema),
});

interface MatcherInput {
  pattern?: string;
  context?: string;
  selector?: string;
  strictness?: string;
  rule?: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  utils?: Record<string, unknown>;
  transform?: Record<string, unknown>;
}

export interface AstTestParams {
  language: string;
  snippet: string;
  matcher: MatcherInput;
}

export interface AstFindParams {
  language: string;
  paths: string[];
  matcher: MatcherInput;
  languageGlobs?: string[];
}

export interface AstRewritePreviewParams {
  language: string;
  matcher: MatcherInput;
  replacement: string;
  snippet?: string;
  path?: string;
}

export interface AstDebugQueryParams {
  language: string;
  query: string;
  selector?: string;
  strictness?: string;
  configPath?: string;
  format?: DebugQueryFormat;
}

export interface AstRuleTestParams {
  configPath?: string;
  testDir?: string;
  snapshotDir?: string;
  filter?: string;
  includeOff?: boolean;
  skipSnapshotTests?: boolean;
}

export interface AstProjectScanParams {
  paths?: string[];
  configPath?: string;
  filter?: string;
  reportStyle?: ReportStyle;
  maxResults?: number;
  includeMetadata?: boolean;
  severity?: ProjectScanSeverityOverrides;
}

interface LanguageSpec {
  normalized: string;
  lang: Lang;
}

interface DisplayPosition {
  line: number;
  column: number;
}

interface DisplayRange {
  start: DisplayPosition;
  end: DisplayPosition;
}

export interface MatchRecord {
  text: string;
  range: DisplayRange;
  file?: string;
  captures?: Record<string, string | string[]>;
  transformed?: Record<string, string>;
}

interface MatcherSummaryPattern {
  kind: "pattern";
  pattern: string;
  transform?: Record<string, unknown>;
}

interface MatcherSummaryPatternObject {
  kind: "pattern_object";
  context: string;
  selector?: string;
  strictness?: string;
  transform?: Record<string, unknown>;
}

interface MatcherSummaryRule {
  kind: "rule";
  rule: Record<string, unknown>;
  constraints?: Record<string, unknown>;
  utils?: Record<string, unknown>;
  transform?: Record<string, unknown>;
}

type MatcherSummary = MatcherSummaryPattern | MatcherSummaryPatternObject | MatcherSummaryRule;

interface NormalizedMatcher {
  config: NapiConfig;
  summary: MatcherSummary;
  captureNames: string[];
  transformedNames: string[];
  noMatchHint?: string;
}

type StructuredToolName =
  | "ast_test"
  | "ast_find"
  | "ast_rewrite_preview"
  | "ast_debug_query"
  | "ast_rule_test"
  | "ast_project_scan";

interface StructuredResultBase {
  tool: StructuredToolName;
  language: string;
  matched: boolean;
  matchCount: number;
}

interface BaseStructuredResult extends StructuredResultBase {
  matcher: MatcherSummary;
  matches: MatchRecord[];
  hint?: string;
}

export interface AstTestResult extends BaseStructuredResult {
  tool: "ast_test";
}

export interface AstFindResult extends BaseStructuredResult {
  tool: "ast_find";
  searchedPaths: string[];
  languageGlobs?: string[];
}

export interface AstRewritePreviewResult extends BaseStructuredResult {
  tool: "ast_rewrite_preview";
  replacement: string;
  input: {
    kind: "snippet" | "file";
    path?: string;
  };
  output: string;
}

export interface ToolResponseDetails {
  tool: StructuredResultBase["tool"];
  language: string;
  matched: boolean;
  matchCount: number;
  truncation?: TruncationResult;
  fullOutputPath?: string;
  searchedPaths?: string[];
  input?: AstRewritePreviewResult["input"];
}

function normalizeNonEmptyString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${field} must not be empty.`);
  }
  return normalized;
}

function ensurePlainObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

export function resolveLanguage(input: string): LanguageSpec {
  const requested = normalizeNonEmptyString(input, "language")!;
  const normalized = requested.toLowerCase();
  const lang = LANGUAGE_ALIASES.get(normalized);
  if (!lang) {
    throw new Error(
      `Unsupported phase-1 language "${requested}". Built-in NAPI values include: ${SUPPORTED_LANGUAGE_HELP}. Use the CLI-backed tools for broader ast-grep language support.`,
    );
  }
  return { normalized, lang };
}

function normalizeCliLanguage(input: string): string {
  const requested = normalizeNonEmptyString(input, "language")!;
  const normalized = requested.toLowerCase();
  if (["js", "javascript", "mjs", "cjs"].includes(normalized)) return "javascript";
  if (["ts", "typescript", "mts", "cts"].includes(normalized)) return "typescript";
  if (normalized === "htm") return "html";
  return normalized;
}

function normalizeStrictness(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (STRICTNESS_VALUES.includes(value as (typeof STRICTNESS_VALUES)[number])) {
    return value;
  }
  throw new Error(
    `matcher.strictness must be one of: ${STRICTNESS_VALUES.join(", ")}.`,
  );
}

function findMetavariables(value: unknown, names: Set<string>): void {
  if (typeof value === "string") {
    const regex = /\${1,3}([A-Z_][A-Z0-9_]*)/g;
    for (const match of value.matchAll(regex)) {
      names.add(match[1]!);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      findMetavariables(item, names);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const entry of Object.values(value)) {
    findMetavariables(entry, names);
  }
}

function collectMetavariableNames(config: NapiConfig): string[] {
  const names = new Set<string>();
  findMetavariables(config, names);
  return Array.from(names).sort();
}

export function normalizeMatcher(input: MatcherInput): NormalizedMatcher {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("matcher must be an object.");
  }

  const pattern = normalizeNonEmptyString(input.pattern, "matcher.pattern");
  const context = normalizeNonEmptyString(input.context, "matcher.context");
  const selector = normalizeNonEmptyString(input.selector, "matcher.selector");
  const strictness = normalizeStrictness(normalizeNonEmptyString(input.strictness, "matcher.strictness"));
  const transform = input.transform === undefined ? undefined : ensurePlainObject(input.transform, "matcher.transform");
  const transformedNames = transform ? Object.keys(transform).sort() : [];
  const hasRule = input.rule !== undefined;

  if (hasRule) {
    if (pattern || context || selector || strictness) {
      throw new Error(
        "matcher.rule cannot be combined with matcher.pattern, matcher.context, matcher.selector, or matcher.strictness.",
      );
    }
    const rule = ensurePlainObject(input.rule, "matcher.rule");
    const constraints = input.constraints === undefined ? undefined : ensurePlainObject(input.constraints, "matcher.constraints");
    const utils = input.utils === undefined ? undefined : ensurePlainObject(input.utils, "matcher.utils");
    const config: NapiConfig = { rule };
    if (constraints) config.constraints = constraints;
    if (utils) config.utils = utils;
    if (transform) config.transform = transform;
    return {
      config,
      summary: { kind: "rule", rule, constraints, utils, transform },
      captureNames: collectMetavariableNames(config),
      transformedNames,
    };
  }

  if (input.constraints !== undefined || input.utils !== undefined) {
    throw new Error("matcher.constraints and matcher.utils are only valid when matcher.rule is provided.");
  }

  if (context) {
    if (pattern) {
      throw new Error("Use matcher.pattern or matcher.context, not both.");
    }
    const patternObject: {
      context: string;
      selector?: string;
      strictness?: string;
    } = {
      context,
      ...(selector ? { selector } : {}),
      ...(strictness ? { strictness } : {}),
    };
    const config: NapiConfig = {
      rule: {
        pattern: patternObject,
      },
    };
    if (transform) config.transform = transform;
    return {
      config,
      summary: { kind: "pattern_object", context, ...(selector ? { selector } : {}), strictness, transform },
      captureNames: collectMetavariableNames(config),
      transformedNames,
    };
  }

  if (selector && strictness) {
    throw new Error(
      "matcher.selector and matcher.strictness require matcher.context. If you started with matcher.pattern, move it into matcher.context form first.",
    );
  }

  if (selector) {
    throw new Error("matcher.selector requires matcher.context.");
  }

  if (strictness) {
    throw new Error(
      "matcher.strictness requires matcher.context. If you started with matcher.pattern, move it into matcher.context form first.",
    );
  }

  if (!pattern) {
    throw new Error("Provide matcher.pattern, matcher.context, or matcher.rule.");
  }

  const config: NapiConfig = { rule: { pattern } };
  if (transform) config.transform = transform;
  return {
    config,
    summary: { kind: "pattern", pattern, transform },
    captureNames: collectMetavariableNames(config),
    transformedNames,
    noMatchHint:
      "No matches. If this is a partial or ambiguous snippet, retry with matcher.context and, when needed, matcher.selector so ast-grep can parse the surrounding construct.",
  };
}

function toDisplayRange(range: Range): DisplayRange {
  return {
    start: {
      line: range.start.line + 1,
      column: range.start.column + 1,
    },
    end: {
      line: range.end.line + 1,
      column: range.end.column + 1,
    },
  };
}

function toDisplayPath(filePath: string, cwd: string): string {
  const relative = path.relative(cwd, filePath);
  if (!relative || relative === "") return ".";
  return relative.startsWith("..") ? filePath : relative;
}

function collectSingleCapture(node: SgNode, name: string): string | string[] | undefined {
  const single = node.getMatch(name);
  if (single) {
    return single.text();
  }
  const multiple = node.getMultipleMatches(name).map((match) => match.text());
  if (multiple.length > 0) {
    return multiple;
  }
  return undefined;
}

function collectCaptures(node: SgNode, captureNames: string[]): Record<string, string | string[]> | undefined {
  const captures: Record<string, string | string[]> = {};
  for (const name of captureNames) {
    const value = collectSingleCapture(node, name);
    if (value !== undefined) {
      captures[name] = value;
    }
  }
  return Object.keys(captures).length > 0 ? captures : undefined;
}

function collectTransformed(node: SgNode, transformedNames: string[]): Record<string, string> | undefined {
  const transformed: Record<string, string> = {};
  for (const name of transformedNames) {
    const value = node.getTransformed(name);
    if (value !== null) {
      transformed[name] = value;
    }
  }
  return Object.keys(transformed).length > 0 ? transformed : undefined;
}

function buildMatchRecord(node: SgNode, matcher: NormalizedMatcher, cwd?: string): MatchRecord {
  const record: MatchRecord = {
    text: node.text(),
    range: toDisplayRange(node.range()),
  };
  const captures = collectCaptures(node, matcher.captureNames);
  if (captures) record.captures = captures;
  const transformed = collectTransformed(node, matcher.transformedNames);
  if (transformed) record.transformed = transformed;
  if (cwd) {
    record.file = toDisplayPath(path.resolve(node.getRoot().filename()), cwd);
  }
  return record;
}

function compareMatches(left: MatchRecord, right: MatchRecord): number {
  const fileCompare = (left.file ?? "").localeCompare(right.file ?? "");
  if (fileCompare !== 0) return fileCompare;
  if (left.range.start.line !== right.range.start.line) {
    return left.range.start.line - right.range.start.line;
  }
  if (left.range.start.column !== right.range.start.column) {
    return left.range.start.column - right.range.start.column;
  }
  return left.text.localeCompare(right.text);
}

function formatMatcherError(error: unknown, matcher: NormalizedMatcher): Error {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;
  if (matcher.noMatchHint) {
    return new Error(`ast-grep matcher failed: ${message}\n\n${matcher.noMatchHint}`, { cause });
  }
  return new Error(`ast-grep matcher failed: ${message}`, { cause });
}

function formatOperationError(prefix: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error : undefined;
  return new Error(`${prefix}: ${message}`, { cause });
}

function resolveUserPath(inputPath: string, cwd: string): string {
  let normalizedPath = inputPath.trim();
  if (normalizedPath.startsWith("@")) {
    normalizedPath = normalizedPath.slice(1);
  }
  if (normalizedPath === "~") {
    normalizedPath = os.homedir();
  } else if (normalizedPath.startsWith("~/")) {
    normalizedPath = path.join(os.homedir(), normalizedPath.slice(2));
  }
  if (!path.isAbsolute(normalizedPath)) {
    normalizedPath = path.resolve(cwd, normalizedPath);
  }
  return path.resolve(normalizedPath);
}

async function waitForCallbackDeliveries(
  options: {
    expectedDeliveries: number;
    getObservedDeliveries: () => number;
    getCallbackError: () => Error | undefined;
    language: string;
    searchedPaths: string[];
  },
): Promise<void> {
  const { expectedDeliveries, getObservedDeliveries, getCallbackError, language, searchedPaths } = options;
  if (expectedDeliveries <= 0) return;

  const startedAt = Date.now();
  let lastObservedDeliveries = getObservedDeliveries();
  let idleDeadline = startedAt + 500;
  const absoluteDeadline = startedAt + 5_000;

  while (getObservedDeliveries() < expectedDeliveries) {
    if (getCallbackError()) return;

    const observedDeliveries = getObservedDeliveries();
    if (observedDeliveries > lastObservedDeliveries) {
      lastObservedDeliveries = observedDeliveries;
      idleDeadline = Date.now() + 500;
    }

    const now = Date.now();
    if (now > idleDeadline || now > absoluteDeadline) {
      throw new Error(
        `ast-grep search callbacks did not drain for ${language} over ${searchedPaths.join(", ")} after ${now - startedAt}ms (${observedDeliveries} / ${expectedDeliveries} deliveries).`,
      );
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function writeFullOutput(toolName: string, fullText: string): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `pi-${toolName}-`));
  const fullOutputPath = path.join(tempDir, "full-output.json");
  await writeFile(fullOutputPath, fullText, "utf8");
  return fullOutputPath;
}

export async function shapeToolResponse<T extends StructuredResultBase>(
  result: T,
  options?: {
    searchedPaths?: string[];
    input?: AstRewritePreviewResult["input"];
  },
): Promise<{ text: string; details: ToolResponseDetails }> {
  const fullText = JSON.stringify(result, null, 2);
  const truncation = truncateHead(fullText, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let text = truncation.content;
  let fullOutputPath: string | undefined;
  if (truncation.truncated) {
    text += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines`;
    text += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
    try {
      fullOutputPath = await writeFullOutput(result.tool, fullText);
      text += ` Full output saved to: ${fullOutputPath}]`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      text += ` Full output could not be saved: ${message}]`;
    }
  }

  return {
    text,
    details: {
      tool: result.tool,
      language: result.language,
      matched: result.matched,
      matchCount: result.matchCount,
      truncation: truncation.truncated ? truncation : undefined,
      fullOutputPath,
      searchedPaths: options?.searchedPaths,
      input: options?.input,
    },
  };
}

export function runAstTest(params: AstTestParams): AstTestResult {
  const language = resolveLanguage(params.language);
  const matcher = normalizeMatcher(params.matcher);
  try {
    const root = parse(language.lang, params.snippet);
    const matches = root.root().findAll(matcher.config).map((node) => buildMatchRecord(node, matcher));
    matches.sort(compareMatches);
    return {
      tool: "ast_test",
      language: language.normalized,
      matcher: matcher.summary,
      matched: matches.length > 0,
      matchCount: matches.length,
      matches,
      ...(matches.length === 0 && matcher.noMatchHint ? { hint: matcher.noMatchHint } : {}),
    };
  } catch (error) {
    throw formatMatcherError(error, matcher);
  }
}

export async function runAstFind(params: AstFindParams, cwd: string): Promise<AstFindResult> {
  const language = resolveLanguage(params.language);
  const matcher = normalizeMatcher(params.matcher);
  const searchPaths = params.paths.map((filePath) => resolveUserPath(filePath, cwd));
  const languageGlobs = params.languageGlobs?.map((value) => normalizeNonEmptyString(value, "languageGlobs entry")!);
  const matches: MatchRecord[] = [];
  let callbackError: Error | undefined;
  let callbackDeliveries = 0;
  let expectedCallbackDeliveries = 0;

  try {
    expectedCallbackDeliveries = await findInFiles(
      language.lang,
      {
        paths: searchPaths,
        matcher: matcher.config,
        ...(languageGlobs ? { languageGlobs } : {}),
      },
      (error, nodes) => {
        callbackDeliveries += 1;
        if (error) {
          callbackError = error;
          return;
        }
        for (const node of nodes) {
          matches.push(buildMatchRecord(node, matcher, cwd));
        }
      },
    );
    await waitForCallbackDeliveries({
      expectedDeliveries: expectedCallbackDeliveries,
      getObservedDeliveries: () => callbackDeliveries,
      getCallbackError: () => callbackError,
      language: language.normalized,
      searchedPaths: searchPaths.map((filePath) => toDisplayPath(filePath, cwd)),
    });
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  if (callbackError) {
    throw callbackError;
  }

  matches.sort(compareMatches);
  return {
    tool: "ast_find",
    language: language.normalized,
    matcher: matcher.summary,
    matched: matches.length > 0,
    matchCount: matches.length,
    matches,
    searchedPaths: searchPaths.map((filePath) => toDisplayPath(filePath, cwd)),
    ...(languageGlobs ? { languageGlobs } : {}),
    ...(matches.length === 0 && matcher.noMatchHint
      ? { hint: `${matcher.noMatchHint} Test the matcher with ast_test before widening the repo search.` }
      : {}),
  };
}

function interpolateReplacement(node: SgNode, replacement: string, matcher: NormalizedMatcher): string {
  const unsupportedMultiple = replacement.match(/\${3}([A-Z_][A-Z0-9_]*)/g);
  if (unsupportedMultiple) {
    throw new Error(
      `replacement does not support $$$NAME placeholders in phase 1. Remove ${unsupportedMultiple.join(", ")} or use a narrower matcher.`,
    );
  }
  return replacement.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_full, name: string) => {
    const transformed = node.getTransformed(name);
    if (transformed !== null) {
      return transformed;
    }
    const capture = node.getMatch(name);
    if (capture) {
      return capture.text();
    }
    throw new Error(`replacement references $${name}, but that capture or transform is not available on every match.`);
  });
}

export async function runAstRewritePreview(
  params: AstRewritePreviewParams,
  cwd: string,
): Promise<AstRewritePreviewResult> {
  const language = resolveLanguage(params.language);
  const matcher = normalizeMatcher(params.matcher);
  const snippet = params.snippet;
  const hasSnippet = typeof snippet === "string" && snippet.trim().length > 0;
  const inputPath = params.path?.trim();

  if (hasSnippet === Boolean(inputPath)) {
    throw new Error("Provide exactly one of snippet or path.");
  }

  const resolvedPath = inputPath ? resolveUserPath(inputPath, cwd) : undefined;
  let source: string;
  try {
    source = resolvedPath ? await readFile(resolvedPath, "utf8") : snippet!;
  } catch (error) {
    throw formatOperationError("ast-grep rewrite preview failed", error);
  }

  let root: ReturnType<typeof parse>;
  try {
    root = parse(language.lang, source);
  } catch (error) {
    throw formatOperationError("ast-grep rewrite preview failed", error);
  }

  let nodes: SgNode[];
  let matches: MatchRecord[];
  try {
    nodes = root.root().findAll(matcher.config);
    matches = nodes.map((node) => buildMatchRecord(node, matcher, resolvedPath ? cwd : undefined));
    matches.sort(compareMatches);
  } catch (error) {
    throw formatMatcherError(error, matcher);
  }

  let output: string;
  try {
    output =
      nodes.length === 0
        ? source
        : root
            .root()
            .commitEdits(nodes.map((node) => node.replace(interpolateReplacement(node, params.replacement, matcher))));
  } catch (error) {
    throw formatOperationError("ast-grep rewrite preview failed", error);
  }

  return {
    tool: "ast_rewrite_preview",
    language: language.normalized,
    matcher: matcher.summary,
    matched: matches.length > 0,
    matchCount: matches.length,
    matches,
    replacement: params.replacement,
    input: resolvedPath
      ? {
          kind: "file",
          path: toDisplayPath(resolvedPath, cwd),
        }
      : {
          kind: "snippet",
        },
    output,
    ...(matches.length === 0 && matcher.noMatchHint ? { hint: matcher.noMatchHint } : {}),
  };
}

export async function runAstDebugQuery(params: AstDebugQueryParams, cwd: string): Promise<AstDebugQueryResult> {
  const query = normalizeNonEmptyString(params.query, "query")!;
  const result = await runCliAstDebugQuery({
    language: normalizeCliLanguage(params.language),
    query,
    selector: normalizeNonEmptyString(params.selector, "selector"),
    strictness: normalizeStrictness(normalizeNonEmptyString(params.strictness, "strictness")),
    configPath: params.configPath ? resolveUserPath(params.configPath, cwd) : undefined,
    format: params.format,
  });

  return {
    ...result,
    ...(result.resolvedConfigPath ? { resolvedConfigPath: toDisplayPath(result.resolvedConfigPath, cwd) } : {}),
    executionCwd: toDisplayPath(result.executionCwd, cwd),
  };
}

export async function runAstRuleTest(params: AstRuleTestParams, cwd: string): Promise<AstRuleTestResult> {
  const result = await runCliAstRuleTest({
    cwd,
    configPath: params.configPath ? resolveUserPath(params.configPath, cwd) : undefined,
    testDir: params.testDir ? resolveUserPath(params.testDir, cwd) : undefined,
    snapshotDir: normalizeNonEmptyString(params.snapshotDir, "snapshotDir"),
    filter: normalizeNonEmptyString(params.filter, "filter"),
    includeOff: params.includeOff,
    skipSnapshotTests: params.skipSnapshotTests,
  });

  return {
    ...result,
    resolvedConfigPath: toDisplayPath(result.resolvedConfigPath, cwd),
    ...(result.resolvedTestDir ? { resolvedTestDir: toDisplayPath(result.resolvedTestDir, cwd) } : {}),
    executionCwd: toDisplayPath(result.executionCwd, cwd),
  };
}

export async function runAstProjectScan(params: AstProjectScanParams, cwd: string): Promise<AstProjectScanResult> {
  const result = await runCliAstProjectScan({
    cwd,
    paths: params.paths?.map((filePath) => resolveUserPath(filePath, cwd)),
    configPath: params.configPath ? resolveUserPath(params.configPath, cwd) : undefined,
    filter: normalizeNonEmptyString(params.filter, "filter"),
    reportStyle: params.reportStyle,
    maxResults: params.maxResults,
    includeMetadata: params.includeMetadata,
    severity: params.severity,
  });

  return {
    ...result,
    resolvedConfigPath: toDisplayPath(result.resolvedConfigPath, cwd),
    executionCwd: toDisplayPath(result.executionCwd, cwd),
  };
}

export default function astGrepExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ast_test",
    label: "AST Test",
    description:
      `Test an ast-grep matcher against a provided code snippet. Returns structured matches with ranges, captures, and transformed metavars when available. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    promptSnippet: "Use ast_test to iterate on an ast-grep matcher against a code snippet before searching a repo.",
    promptGuidelines: [
      "Use ast_test first when refining an ast-grep matcher or debugging why a snippet does not match.",
    ],
    parameters: AstTestParamsSchema,
    async execute(_toolCallId, params) {
      const result = runAstTest(params as AstTestParams);
      const shaped = await shapeToolResponse(result);
      return {
        content: [{ type: "text", text: shaped.text }],
        details: shaped.details,
      };
    },
  });

  pi.registerTool({
    name: "ast_find",
    label: "AST Find",
    description:
      `Search one or more paths with an ast-grep matcher using @ast-grep/napi. Returns structured file matches with ranges, captures, and transformed metavars when available. Phase 1 is not sgconfig-aware. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    promptSnippet: "Use ast_find for structured repo search after a matcher already works in ast_test.",
    promptGuidelines: [
      "Use ast_find after ast_test to run the same matcher across one or more paths relative to the current working directory.",
      "Do not use ast_find for sgconfig-aware scans, ast-grep test, or debug-query inspection. Use ast_project_scan, ast_rule_test, or ast_debug_query for those workflows.",
    ],
    parameters: AstFindParamsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runAstFind(params as AstFindParams, ctx.cwd);
      const shaped = await shapeToolResponse(result, { searchedPaths: result.searchedPaths });
      return {
        content: [{ type: "text", text: shaped.text }],
        details: shaped.details,
      };
    },
  });

  pi.registerTool({
    name: "ast_rewrite_preview",
    label: "AST Rewrite Preview",
    description:
      `Preview a narrow ast-grep rewrite on a snippet or a single file without mutating anything. Supports literal replacement text plus $NAME placeholders for single captures or transformed metavars. This is not YAML fix or apply behavior. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    promptSnippet: "Use ast_rewrite_preview only when the user wants a preview-only ast-grep rewrite without mutating files.",
    promptGuidelines: [
      "Use ast_rewrite_preview only for preview-only replacements on a snippet or one file. It never mutates the filesystem.",
    ],
    parameters: AstRewritePreviewParamsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runAstRewritePreview(params as AstRewritePreviewParams, ctx.cwd);
      const shaped = await shapeToolResponse(result, { input: result.input });
      return {
        content: [{ type: "text", text: shaped.text }],
        details: shaped.details,
      };
    },
  });

  pi.registerTool({
    name: "ast_debug_query",
    label: "AST Debug Query",
    description:
      `Inspect how ast-grep parses a raw query string via sg run --debug-query. Supports selector, strictness, and optional sgconfig-aware custom language context without searching the repo. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    promptSnippet: "Use ast_debug_query for CLI-backed parse inspection when you need to see how ast-grep reads a raw query or custom-language config context.",
    promptGuidelines: [
      "Use ast_debug_query for parse inspection, not repo search or matcher iteration.",
      "Pass configPath when custom languages or sgconfig-aware parsing behavior matters.",
    ],
    parameters: AstDebugQueryParamsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runAstDebugQuery(params as AstDebugQueryParams, ctx.cwd);
      const shaped = await shapeToolResponse(result);
      return {
        content: [{ type: "text", text: shaped.text }],
        details: shaped.details,
      };
    },
  });

  pi.registerTool({
    name: "ast_rule_test",
    label: "AST Rule Test",
    description:
      `Run sg test against an ast-grep project without mutating snapshots. Returns pass/fail metadata, structured case details, notices, and the raw CLI output. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    promptSnippet: "Use ast_rule_test for ast-grep rule fixtures and snapshot verification without updating anything.",
    promptGuidelines: [
      "Use ast_rule_test for read-only sg test runs. It does not expose interactive review or snapshot updates.",
    ],
    parameters: AstRuleTestParamsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runAstRuleTest(params as AstRuleTestParams, ctx.cwd);
      const shaped = await shapeToolResponse(result);
      return {
        content: [{ type: "text", text: shaped.text }],
        details: shaped.details,
      };
    },
  });

  pi.registerTool({
    name: "ast_project_scan",
    label: "AST Project Scan",
    description:
      `Run sg scan with sgconfig-aware project discovery and return structured findings that preserve labels, captures, replacement data, metadata, and byte offsets. Supports report style, result limits, and severity overrides without exposing interactive apply flows. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
    promptSnippet: "Use ast_project_scan for sgconfig-aware project scans with structured findings.",
    promptGuidelines: [
      "Use ast_project_scan for config-driven ast-grep scans instead of ast_find when project rules and sgconfig.yml matter.",
      "Do not use ast_project_scan for interactive apply flows or snapshot updates.",
    ],
    parameters: AstProjectScanParamsSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runAstProjectScan(params as AstProjectScanParams, ctx.cwd);
      const shaped = await shapeToolResponse(result, { searchedPaths: result.searchedPaths });
      return {
        content: [{ type: "text", text: shaped.text }],
        details: shaped.details,
      };
    },
  });
}
