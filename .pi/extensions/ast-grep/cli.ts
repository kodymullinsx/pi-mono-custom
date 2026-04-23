import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEBUG_QUERY_FORMAT_VALUES = ["pattern", "ast", "cst", "sexp"] as const;
export const REPORT_STYLE_VALUES = ["rich", "medium", "short"] as const;
export const SEVERITY_OVERRIDE_LEVELS = ["error", "warning", "info", "hint", "off"] as const;
export const STRICTNESS_VALUES = ["cst", "smart", "ast", "relaxed", "signature", "template"] as const;

export type DebugQueryFormat = (typeof DEBUG_QUERY_FORMAT_VALUES)[number];
export type ReportStyle = (typeof REPORT_STYLE_VALUES)[number];
export type SeverityOverrideLevel = (typeof SEVERITY_OVERRIDE_LEVELS)[number];
export type Strictness = (typeof STRICTNESS_VALUES)[number];

export interface DisplayPosition {
  line: number;
  column: number;
}

export interface ByteOffsetSpan {
  start: number;
  end: number;
}

export interface DisplayRange {
  start: DisplayPosition;
  end: DisplayPosition;
  byteOffset?: ByteOffsetSpan;
}

export interface ReplacementOffsets {
  start: number;
  end: number;
}

export interface ProjectScanCharCount {
  leading: number;
  trailing: number;
}

export interface ProjectScanCapture {
  text: string;
  range?: DisplayRange;
}

export interface ProjectScanMetaVariables {
  single?: Record<string, ProjectScanCapture>;
  multi?: Record<string, ProjectScanCapture[]>;
  transformed?: Record<string, string>;
}

export interface ProjectScanLabel {
  text: string;
  range?: DisplayRange;
  style: string;
  message?: string;
}

export interface ProjectScanFinding {
  ruleId: string;
  severity: string;
  message: string;
  text: string;
  file: string;
  range: DisplayRange;
  lines?: string;
  charCount?: ProjectScanCharCount;
  language?: string;
  metaVariables?: ProjectScanMetaVariables;
  labels?: ProjectScanLabel[];
  replacement?: string;
  replacementOffsets?: ReplacementOffsets;
  note?: string;
  metadata?: Record<string, unknown>;
}

export interface ProjectScanSeverityOverrides {
  error?: string[];
  warning?: string[];
  info?: string[];
  hint?: string[];
  off?: string[];
}

export interface AstDebugQueryOptions {
  language: string;
  query: string;
  format?: DebugQueryFormat;
  selector?: string;
  strictness?: Strictness;
  configPath?: string;
}

export interface AstDebugQueryResult {
  tool: "ast_debug_query";
  language: string;
  matched: false;
  matchCount: 0;
  query: string;
  format: DebugQueryFormat;
  selector?: string;
  strictness?: Strictness;
  resolvedConfigPath?: string;
  executionCwd: string;
  output: string;
  exitCode: number;
  sgBinary: string;
  command: string;
}

export interface AstRuleTestOptions {
  cwd: string;
  configPath?: string;
  testDir?: string;
  snapshotDir?: string;
  filter?: string;
  includeOff?: boolean;
  skipSnapshotTests?: boolean;
}

export interface AstRuleTestSummary {
  status: "passed" | "failed" | "unknown";
  passedCount: number;
  failedCount: number;
  totalCount?: number;
}

export interface AstRuleTestCaseResult {
  ruleId: string;
  status: "passed" | "failed";
  summary: string;
}

export type AstRuleTestIssueKind =
  | "unexpected_match"
  | "missing_match"
  | "snapshot_mismatch"
  | "missing_snapshot"
  | "unknown";

export interface AstRuleTestIssue {
  kind: AstRuleTestIssueKind;
  message: string;
  ruleId?: string;
  snippet?: string;
  block: string;
}

export interface AstRuleTestNotice {
  kind: "configuration_missing" | "severity_off_excluded" | "other";
  message: string;
  ruleId?: string;
  rawMessage?: string;
  hint?: string;
}

export interface AstRuleTestParsedOutput {
  summary: AstRuleTestSummary;
  cases: AstRuleTestCaseResult[];
  issues: AstRuleTestIssue[];
  notices: AstRuleTestNotice[];
}

export interface AstRuleTestResult {
  tool: "ast_rule_test";
  language: "project";
  matched: boolean;
  matchCount: number;
  passed: boolean;
  summary: AstRuleTestSummary;
  cases: AstRuleTestCaseResult[];
  issues: AstRuleTestIssue[];
  notices: AstRuleTestNotice[];
  resolvedConfigPath: string;
  resolvedTestDir?: string;
  snapshotDir?: string;
  executionCwd: string;
  filter?: string;
  includeOff: boolean;
  skipSnapshotTests: boolean;
  exitCode: number;
  sgBinary: string;
  command: string;
  rawOutput: string;
}

export interface AstProjectScanOptions {
  cwd: string;
  paths?: string[];
  configPath?: string;
  filter?: string;
  reportStyle?: ReportStyle;
  maxResults?: number;
  includeMetadata?: boolean;
  severity?: ProjectScanSeverityOverrides;
}

export interface AstProjectScanResult {
  tool: "ast_project_scan";
  language: "project";
  matched: boolean;
  matchCount: number;
  findings: ProjectScanFinding[];
  searchedPaths: string[];
  resolvedConfigPath: string;
  executionCwd: string;
  reportStyle: ReportStyle;
  includeMetadata: boolean;
  filter?: string;
  maxResults?: number;
  severity?: ProjectScanSeverityOverrides;
  exitCode: number;
  sgBinary: string;
  command: string;
  stderr?: string;
  diagnosticOutput?: string;
}

interface ProjectContext {
  resolvedConfigPath: string;
  executionCwd: string;
}

interface SgExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  sgBinary: string;
  command: string;
}

const SG_BINARY_CANDIDATES = [process.env.PI_AST_GREP_SG, "/opt/homebrew/bin/sg", "sg"].filter(
  (value): value is string => Boolean(value && value.trim()),
);

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

function normalizeStringList(values: string[] | undefined, field: string): string[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values)) {
    throw new Error(`${field} must be an array of strings.`);
  }
  return values.map((value, index) => normalizeNonEmptyString(value, `${field}[${index}]`)!);
}

function normalizeDebugQueryFormat(value: unknown): DebugQueryFormat {
  const normalized = normalizeNonEmptyString(value ?? "pattern", "format")!.toLowerCase();
  if (DEBUG_QUERY_FORMAT_VALUES.includes(normalized as DebugQueryFormat)) {
    return normalized as DebugQueryFormat;
  }
  throw new Error(`format must be one of: ${DEBUG_QUERY_FORMAT_VALUES.join(", ")}.`);
}

function normalizeStrictness(value: unknown, field: string): Strictness | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizeNonEmptyString(value, field)!.toLowerCase();
  if (STRICTNESS_VALUES.includes(normalized as Strictness)) {
    return normalized as Strictness;
  }
  throw new Error(`${field} must be one of: ${STRICTNESS_VALUES.join(", ")}.`);
}

function normalizeReportStyle(value: unknown): ReportStyle {
  const normalized = normalizeNonEmptyString(value ?? "rich", "reportStyle")!.toLowerCase();
  if (REPORT_STYLE_VALUES.includes(normalized as ReportStyle)) {
    return normalized as ReportStyle;
  }
  throw new Error(`reportStyle must be one of: ${REPORT_STYLE_VALUES.join(", ")}.`);
}

function normalizeSeverityOverrides(value: ProjectScanSeverityOverrides | undefined): ProjectScanSeverityOverrides | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("severity must be an object.");
  }
  const normalized: ProjectScanSeverityOverrides = {};
  for (const level of SEVERITY_OVERRIDE_LEVELS) {
    const ids = normalizeStringList(value[level], `severity.${level}`);
    if (ids?.length) {
      normalized[level] = ids;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function quoteArg(arg: string): string {
  return /^[A-Za-z0-9_./:-]+$/.test(arg) ? arg : JSON.stringify(arg);
}

function normalizeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a number.`);
  }
  return value;
}

function parseByteOffset(value: unknown, field: string): ByteOffsetSpan | undefined {
  if (value === undefined || value === null) return undefined;
  const object = ensurePlainObject(value, field);
  return {
    start: normalizeInteger(object.start, `${field}.start`) ?? 0,
    end: normalizeInteger(object.end, `${field}.end`) ?? 0,
  };
}

function toDisplayRange(value: unknown, field: string): DisplayRange {
  const range = ensurePlainObject(value, field);
  const start = ensurePlainObject(range.start, `${field}.start`);
  const end = ensurePlainObject(range.end, `${field}.end`);
  const byteOffset = parseByteOffset(range.byteOffset, `${field}.byteOffset`);

  return {
    start: {
      line: (normalizeInteger(start.line, `${field}.start.line`) ?? 0) + 1,
      column: (normalizeInteger(start.column, `${field}.start.column`) ?? 0) + 1,
    },
    end: {
      line: (normalizeInteger(end.line, `${field}.end.line`) ?? 0) + 1,
      column: (normalizeInteger(end.column, `${field}.end.column`) ?? 0) + 1,
    },
    ...(byteOffset ? { byteOffset } : {}),
  };
}

function parseProjectScanCharCount(value: unknown, field: string): ProjectScanCharCount | undefined {
  if (value === undefined || value === null) return undefined;
  const object = ensurePlainObject(value, field);
  return {
    leading: normalizeInteger(object.leading, `${field}.leading`) ?? 0,
    trailing: normalizeInteger(object.trailing, `${field}.trailing`) ?? 0,
  };
}

function parseProjectScanCapture(value: unknown, field: string): ProjectScanCapture {
  const object = ensurePlainObject(value, field);
  return {
    text: typeof object.text === "string" ? object.text : "",
    ...(object.range ? { range: toDisplayRange(object.range, `${field}.range`) } : {}),
  };
}

function parseProjectScanMetaVariables(value: unknown, field: string): ProjectScanMetaVariables | undefined {
  if (value === undefined || value === null) return undefined;
  const object = ensurePlainObject(value, field);
  const singleInput = object.single ? ensurePlainObject(object.single, `${field}.single`) : undefined;
  const multiInput = object.multi ? ensurePlainObject(object.multi, `${field}.multi`) : undefined;
  const transformedInput = object.transformed ? ensurePlainObject(object.transformed, `${field}.transformed`) : undefined;

  const single = singleInput
    ? Object.fromEntries(
        Object.entries(singleInput).map(([name, capture]) => [name, parseProjectScanCapture(capture, `${field}.single.${name}`)]),
      )
    : undefined;

  const multi = multiInput
    ? Object.fromEntries(
        Object.entries(multiInput).map(([name, captures]) => {
          if (!Array.isArray(captures)) {
            throw new Error(`${field}.multi.${name} must be an array.`);
          }
          return [
            name,
            captures.map((capture, index) => parseProjectScanCapture(capture, `${field}.multi.${name}[${index}]`)),
          ];
        }),
      )
    : undefined;

  const transformed = transformedInput
    ? Object.fromEntries(
        Object.entries(transformedInput)
          .filter(([, transformedValue]) => typeof transformedValue === "string")
          .map(([name, transformedValue]) => [name, transformedValue as string]),
      )
    : undefined;

  if (!single && !multi && !transformed) {
    return undefined;
  }

  return {
    ...(single && Object.keys(single).length > 0 ? { single } : {}),
    ...(multi && Object.keys(multi).length > 0 ? { multi } : {}),
    ...(transformed && Object.keys(transformed).length > 0 ? { transformed } : {}),
  };
}

function parseProjectScanLabels(value: unknown, field: string): ProjectScanLabel[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  return value.map((entry, index) => {
    const object = ensurePlainObject(entry, `${field}[${index}]`);
    return {
      text: typeof object.text === "string" ? object.text : "",
      style: normalizeNonEmptyString(object.style, `${field}[${index}].style`) ?? "primary",
      ...(object.message ? { message: String(object.message) } : {}),
      ...(object.range ? { range: toDisplayRange(object.range, `${field}[${index}].range`) } : {}),
    };
  });
}

function parseReplacementOffsets(value: unknown, field: string): ReplacementOffsets | undefined {
  if (value === undefined || value === null) return undefined;
  const object = ensurePlainObject(value, field);
  return {
    start: normalizeInteger(object.start, `${field}.start`) ?? 0,
    end: normalizeInteger(object.end, `${field}.end`) ?? 0,
  };
}

function toDisplayPath(filePath: string, cwd: string): string {
  const relative = path.relative(cwd, filePath);
  if (!relative || relative === "") return ".";
  return relative.startsWith("..") ? filePath : relative;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(targetPath: string): Promise<boolean> {
  if (!path.isAbsolute(targetPath)) {
    return true;
  }
  try {
    await access(targetPath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveSgBinary(): Promise<string> {
  for (const candidate of SG_BINARY_CANDIDATES) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }
  return SG_BINARY_CANDIDATES[SG_BINARY_CANDIDATES.length - 1] ?? "sg";
}

async function getSearchDirectory(targetPath: string): Promise<string> {
  const stats = await stat(targetPath);
  return stats.isDirectory() ? targetPath : path.dirname(targetPath);
}

async function findNearestConfig(targetPath: string): Promise<string | undefined> {
  let current = await getSearchDirectory(targetPath);
  while (true) {
    const candidate = path.join(current, "sgconfig.yml");
    if (await pathExists(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

async function resolveProjectContext(options: {
  cwd: string;
  configPath?: string;
  candidatePaths?: string[];
}): Promise<ProjectContext> {
  if (options.configPath) {
    if (!(await pathExists(options.configPath))) {
      throw new Error(`configPath does not exist: ${options.configPath}`);
    }
    return {
      resolvedConfigPath: options.configPath,
      executionCwd: path.dirname(options.configPath),
    };
  }

  const candidates = options.candidatePaths?.length ? options.candidatePaths : [options.cwd];
  const discovered = new Set<string>();

  for (const candidate of candidates) {
    const configPath = await findNearestConfig(candidate);
    if (!configPath) {
      throw new Error(
        `No sgconfig.yml found for ${candidate}. Provide configPath or run inside an ast-grep project root.`,
      );
    }
    discovered.add(configPath);
  }

  if (discovered.size !== 1) {
    throw new Error("Provided paths span multiple ast-grep projects. Split the scan or pass configPath explicitly.");
  }

  const [resolvedConfigPath] = Array.from(discovered);
  return {
    resolvedConfigPath,
    executionCwd: path.dirname(resolvedConfigPath),
  };
}

function toCliPath(targetPath: string, executionCwd: string): string {
  const relative = path.relative(executionCwd, targetPath);
  if (!relative || relative === "") return ".";
  return relative.startsWith("..") ? targetPath : relative;
}

function ensurePlainObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function normalizeCliFilePath(filePath: string, executionCwd: string, callerCwd: string): string {
  const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(executionCwd, filePath);
  return toDisplayPath(absolute, callerCwd);
}

export function stripAnsi(text: string): string {
  return text
    .replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

export function parseJsonStream(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      throw new Error("Expected ast-grep scan JSON output to be an array.");
    }
    return parsed;
  }
  return trimmed
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

export function parseProjectScanStream(
  text: string,
  executionCwd: string,
  callerCwd: string,
): ProjectScanFinding[] {
  return parseJsonStream(text).map((entry, index) => {
    const object = ensurePlainObject(entry, `scan result ${index}`);
    const file = normalizeNonEmptyString(object.file, `scan result ${index}.file`)!;
    const ruleId = normalizeNonEmptyString(object.ruleId, `scan result ${index}.ruleId`)!;
    const severity = normalizeNonEmptyString(object.severity, `scan result ${index}.severity`) ?? "unknown";
    const message = normalizeNonEmptyString(object.message, `scan result ${index}.message`) ?? "";
    const metadata = object.metadata ? ensurePlainObject(object.metadata, `scan result ${index}.metadata`) : undefined;
    const metaVariables = parseProjectScanMetaVariables(object.metaVariables, `scan result ${index}.metaVariables`);
    const labels = parseProjectScanLabels(object.labels, `scan result ${index}.labels`);
    const replacementOffsets = parseReplacementOffsets(
      object.replacementOffsets,
      `scan result ${index}.replacementOffsets`,
    );
    const charCount = parseProjectScanCharCount(object.charCount, `scan result ${index}.charCount`);
    const note = typeof object.note === "string" ? object.note : undefined;
    return {
      ruleId,
      severity,
      message,
      text: typeof object.text === "string" ? object.text : "",
      file: normalizeCliFilePath(file, executionCwd, callerCwd),
      range: toDisplayRange(object.range, `scan result ${index}.range`),
      ...(typeof object.lines === "string" ? { lines: object.lines } : {}),
      ...(charCount ? { charCount } : {}),
      ...(typeof object.language === "string" ? { language: object.language } : {}),
      ...(metaVariables ? { metaVariables } : {}),
      ...(labels?.length ? { labels } : {}),
      ...(typeof object.replacement === "string" ? { replacement: object.replacement } : {}),
      ...(replacementOffsets ? { replacementOffsets } : {}),
      ...(note ? { note } : {}),
      ...(metadata ? { metadata } : {}),
    };
  });
}

export function parseRuleTestSummary(text: string): AstRuleTestSummary {
  const stripped = stripAnsi(text);
  const countsMatch = stripped.match(/(\d+) passed;\s*(\d+) failed;/);
  const passedCount = countsMatch ? Number(countsMatch[1]) : 0;
  const failedCount = countsMatch ? Number(countsMatch[2]) : 0;
  const totalCount = countsMatch ? passedCount + failedCount : undefined;

  if (/test result:\s*ok\./i.test(stripped)) {
    return { status: "passed", passedCount, failedCount, totalCount };
  }
  if (/Error:\s*test failed\./i.test(stripped) || failedCount > 0) {
    return { status: "failed", passedCount, failedCount, totalCount };
  }
  return { status: "unknown", passedCount, failedCount, totalCount };
}

function extractRuleTestSnippet(blockLines: string[]): string | undefined {
  const markers = new Set(["For Code:"]);
  for (let index = 0; index < blockLines.length; index += 1) {
    if (!markers.has(blockLines[index]?.trim() ?? "")) {
      continue;
    }
    const snippetLines: string[] = [];
    for (let cursor = index + 1; cursor < blockLines.length; cursor += 1) {
      const line = blockLines[cursor] ?? "";
      if (!line.trim()) {
        if (snippetLines.length > 0) break;
        continue;
      }
      snippetLines.push(line.trimEnd());
    }
    if (snippetLines.length > 0) {
      return snippetLines.join("\n").trim();
    }
  }

  const header = blockLines[0]?.trim() ?? "";
  if (header.endsWith("in:")) {
    const snippetLines = blockLines
      .slice(1)
      .filter((line) => line.trim().length > 0)
      .map((line) => line.trimEnd());
    if (snippetLines.length > 0) {
      return snippetLines.join("\n").trim();
    }
  }

  return undefined;
}

function parseRuleTestIssue(blockLines: string[]): AstRuleTestIssue | undefined {
  const block = blockLines.join("\n").trim();
  if (!block) return undefined;
  const header = blockLines[0]?.trim() ?? "";
  const snippet = extractRuleTestSnippet(blockLines);

  const noisyMatch = header.match(/^\[Noisy\]\s+Expect\s+(\S+)\s+to report no issue, but some issues found in:/);
  if (noisyMatch) {
    return {
      kind: "unexpected_match",
      ruleId: noisyMatch[1],
      message: `Expected ${noisyMatch[1]} to report no issue, but some issues were found.`,
      ...(snippet ? { snippet } : {}),
      block,
    };
  }

  const missingMatch = header.match(/^\[Missing\]\s+Expect rule\s+(\S+)\s+to report issues, but none found in:/);
  if (missingMatch) {
    return {
      kind: "missing_match",
      ruleId: missingMatch[1],
      message: `Expected ${missingMatch[1]} to report issues, but none were found.`,
      ...(snippet ? { snippet } : {}),
      block,
    };
  }

  const missingSnapshot = header.match(/^\[Wrong\]\s+No\s+(\S+)\s+baseline found\./);
  if (missingSnapshot) {
    return {
      kind: "missing_snapshot",
      ruleId: missingSnapshot[1],
      message: `No ${missingSnapshot[1]} baseline found.`,
      ...(snippet ? { snippet } : {}),
      block,
    };
  }

  if (header.startsWith("[Wrong]")) {
    return {
      kind: "snapshot_mismatch",
      message: header.replace(/^\[Wrong\]\s*/, "") || "Snapshot mismatch.",
      ...(snippet ? { snippet } : {}),
      block,
    };
  }

  return {
    kind: "unknown",
    message: header || "Unknown ast-grep test issue.",
    ...(snippet ? { snippet } : {}),
    block,
  };
}

export function parseRuleTestOutput(text: string): AstRuleTestParsedOutput {
  const stripped = stripAnsi(text).replace(/\r\n/g, "\n");
  const summary = parseRuleTestSummary(stripped);
  const lines = stripped.split("\n");
  const cases: AstRuleTestCaseResult[] = [];
  const issues: AstRuleTestIssue[] = [];
  const notices: AstRuleTestNotice[] = [];
  let inCaseDetails = false;
  let currentBlock: string[] = [];

  const flushBlock = () => {
    const issue = parseRuleTestIssue(currentBlock);
    if (issue) {
      issues.push(issue);
    }
    currentBlock = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const configNotice = trimmed.match(/^Configuration not found!\s+(\S+)$/);
    if (configNotice) {
      notices.push({
        kind: "configuration_missing",
        ruleId: configNotice[1],
        message: trimmed,
      });
      continue;
    }

    if (trimmed === "----------- Case Details -----------") {
      inCaseDetails = true;
      flushBlock();
      continue;
    }

    const caseMatch = trimmed.match(/^(PASS|FAIL)\s+(\S+)\s+([.A-Z]+)$/);
    if (caseMatch) {
      if (inCaseDetails) {
        flushBlock();
        inCaseDetails = false;
      }
      cases.push({
        status: caseMatch[1] === "PASS" ? "passed" : "failed",
        ruleId: caseMatch[2]!,
        summary: caseMatch[3]!,
      });
      continue;
    }

    if (inCaseDetails) {
      if (/^\[(Wrong|Noisy|Missing)\]/.test(trimmed)) {
        flushBlock();
        currentBlock = [line];
        continue;
      }
      if (currentBlock.length > 0 || trimmed.length > 0) {
        currentBlock.push(line);
      }
    }
  }

  flushBlock();

  return {
    summary,
    cases,
    issues,
    notices,
  };
}

async function runSg(args: string[], options: { cwd: string; stdin?: string }): Promise<SgExecutionResult> {
  const sgBinary = await resolveSgBinary();
  const command = [sgBinary, ...args].map(quoteArg).join(" ");

  return await new Promise<SgExecutionResult>((resolve, reject) => {
    const child = spawn(sgBinary, args, {
      cwd: options.cwd,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      reject(new Error(`Unable to execute ast-grep CLI (${command}): ${error.message}`));
    });
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        sgBinary,
        command,
      });
    });

    if (options.stdin !== undefined) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();
  });
}

function joinOutput(stdout: string, stderr: string): string {
  if (stdout && stderr) {
    return `${stdout.trimEnd()}\n${stderr.trimEnd()}`.trim();
  }
  return (stdout || stderr).trim();
}

function normalizeCliError(message: string, result: SgExecutionResult): Error {
  const details = stripAnsi(joinOutput(result.stdout, result.stderr));
  return new Error(details ? `${message}\n\n${details}` : `${message} (exit code ${result.exitCode}).`);
}

export async function runAstDebugQuery(options: AstDebugQueryOptions): Promise<AstDebugQueryResult> {
  const query = normalizeNonEmptyString(options.query, "query")!;
  const language = normalizeNonEmptyString(options.language, "language")!;
  const format = normalizeDebugQueryFormat(options.format);
  const selector = normalizeNonEmptyString(options.selector, "selector");
  const strictness = normalizeStrictness(options.strictness, "strictness");
  const configPath = normalizeNonEmptyString(options.configPath, "configPath");
  const executionCwd = configPath ? path.dirname(configPath) : undefined;

  if (configPath && !(await pathExists(configPath))) {
    throw new Error(`configPath does not exist: ${configPath}`);
  }

  const emptyDir = await mkdtemp(path.join(os.tmpdir(), "pi-ast-debug-query-"));

  try {
    const args = [
      "run",
      "--pattern",
      query,
      "--lang",
      language,
      ...(selector ? ["--selector", selector] : []),
      ...(strictness ? ["--strictness", strictness] : []),
      ...(configPath ? ["-c", configPath] : []),
      `--debug-query=${format}`,
      "--color=never",
      emptyDir,
    ];

    const result = await runSg(args, { cwd: executionCwd ?? emptyDir });
    const output = stripAnsi(joinOutput(result.stdout, result.stderr)).trimEnd();

    if (![0, 1].includes(result.exitCode) || !output) {
      throw normalizeCliError("ast-grep debug-query failed.", result);
    }

    return {
      tool: "ast_debug_query",
      language,
      matched: false,
      matchCount: 0,
      query,
      format,
      ...(selector ? { selector } : {}),
      ...(strictness ? { strictness } : {}),
      ...(configPath ? { resolvedConfigPath: configPath } : {}),
      executionCwd: executionCwd ?? emptyDir,
      output,
      exitCode: result.exitCode,
      sgBinary: result.sgBinary,
      command: result.command,
    };
  } finally {
    await rm(emptyDir, { recursive: true, force: true });
  }
}

export async function runAstRuleTest(options: AstRuleTestOptions): Promise<AstRuleTestResult> {
  const filter = normalizeNonEmptyString(options.filter, "filter");
  const snapshotDir = normalizeNonEmptyString(options.snapshotDir, "snapshotDir");
  const context = await resolveProjectContext({
    cwd: options.cwd,
    configPath: options.configPath,
    candidatePaths: options.testDir ? [options.testDir] : undefined,
  });
  const buildArgs = (overrides?: { filter?: string; includeOff?: boolean }) => {
    const args = ["test", "-c", context.resolvedConfigPath];

    if (options.testDir) {
      args.push("--test-dir", toCliPath(options.testDir, context.executionCwd));
    }
    if (snapshotDir) {
      args.push("--snapshot-dir", snapshotDir);
    }
    const effectiveFilter = overrides?.filter ?? filter;
    if (effectiveFilter) {
      args.push("--filter", effectiveFilter);
    }
    if (overrides?.includeOff ?? options.includeOff) {
      args.push("--include-off");
    }
    if (options.skipSnapshotTests) {
      args.push("--skip-snapshot-tests");
    }

    return args;
  };

  const result = await runSg(buildArgs(), { cwd: context.executionCwd });
  const rawOutput = stripAnsi(joinOutput(result.stdout, result.stderr));
  const parsed = parseRuleTestOutput(rawOutput);

  if (![0, 4].includes(result.exitCode)) {
    throw normalizeCliError("ast-grep test failed to run.", result);
  }

  const notices = await Promise.all(parsed.notices.map(async (notice) => {
    if (options.includeOff || notice.kind !== "configuration_missing" || !notice.ruleId) {
      return notice;
    }

    const probeResult = await runSg(
      buildArgs({ filter: notice.ruleId, includeOff: true }),
      { cwd: context.executionCwd },
    );
    if (![0, 4].includes(probeResult.exitCode)) {
      return notice;
    }

    const probeOutput = stripAnsi(joinOutput(probeResult.stdout, probeResult.stderr));
    const probeParsed = parseRuleTestOutput(probeOutput);
    const stillMissing = probeParsed.notices.some(
      (candidate) => candidate.kind === "configuration_missing" && candidate.ruleId === notice.ruleId,
    );
    const hasRuleCase = probeParsed.cases.some((candidate) => candidate.ruleId === notice.ruleId);

    if (!stillMissing && hasRuleCase) {
      return {
        kind: "severity_off_excluded",
        ruleId: notice.ruleId,
        message: `Rule ${notice.ruleId} exists but is severity: off, so sg test excluded it. Re-run with includeOff to test it.`,
        rawMessage: notice.message,
        hint: "Pass includeOff: true to include severity: off rules.",
      };
    }

    return notice;
  }));

  return {
    tool: "ast_rule_test",
    language: "project",
    matched: parsed.summary.failedCount > 0,
    matchCount: parsed.summary.failedCount,
    passed: parsed.summary.status === "passed" && parsed.summary.failedCount === 0,
    summary: parsed.summary,
    cases: parsed.cases,
    issues: parsed.issues,
    notices,
    resolvedConfigPath: context.resolvedConfigPath,
    ...(options.testDir ? { resolvedTestDir: options.testDir } : {}),
    ...(snapshotDir ? { snapshotDir } : {}),
    executionCwd: context.executionCwd,
    ...(filter ? { filter } : {}),
    includeOff: Boolean(options.includeOff),
    skipSnapshotTests: Boolean(options.skipSnapshotTests),
    exitCode: result.exitCode,
    sgBinary: result.sgBinary,
    command: result.command,
    rawOutput,
  };
}

export async function runAstProjectScan(options: AstProjectScanOptions): Promise<AstProjectScanResult> {
  const filter = normalizeNonEmptyString(options.filter, "filter");
  const reportStyle = normalizeReportStyle(options.reportStyle);
  const severity = normalizeSeverityOverrides(options.severity);
  if (options.maxResults !== undefined && (!Number.isInteger(options.maxResults) || options.maxResults <= 0)) {
    throw new Error("maxResults must be a positive integer.");
  }

  const context = await resolveProjectContext({
    cwd: options.cwd,
    configPath: options.configPath,
    candidatePaths: options.paths?.length ? options.paths : undefined,
  });
  const resolvedPaths = options.paths?.length ? options.paths : [context.executionCwd];
  const cliPaths = resolvedPaths.map((targetPath) => toCliPath(targetPath, context.executionCwd));
  const baseArgs = ["scan", "--color=never", "-c", context.resolvedConfigPath];

  if (filter) {
    baseArgs.push("--filter", filter);
  }
  if (options.maxResults !== undefined) {
    baseArgs.push("--max-results", String(options.maxResults));
  }
  if (severity) {
    for (const level of SEVERITY_OVERRIDE_LEVELS) {
      for (const ruleId of severity[level] ?? []) {
        baseArgs.push(`--${level}=${ruleId}`);
      }
    }
  }

  const jsonArgs = [...baseArgs, "--json=stream"];
  if (options.includeMetadata) {
    jsonArgs.push("--include-metadata");
  }
  jsonArgs.push(...cliPaths);

  const result = await runSg(jsonArgs, { cwd: context.executionCwd });
  if (![0, 1].includes(result.exitCode)) {
    throw normalizeCliError("ast-grep project scan failed.", result);
  }

  let diagnosticOutput: string | undefined;
  if (options.reportStyle !== undefined) {
    const diagnosticResult = await runSg(
      [...baseArgs, "--report-style", reportStyle, ...cliPaths],
      { cwd: context.executionCwd },
    );
    if (![0, 1].includes(diagnosticResult.exitCode)) {
      throw normalizeCliError("ast-grep diagnostic scan failed.", diagnosticResult);
    }
    diagnosticOutput = stripAnsi(joinOutput(diagnosticResult.stdout, diagnosticResult.stderr));
  }

  const findings = parseProjectScanStream(result.stdout, context.executionCwd, options.cwd);
  const stderr = stripAnsi(result.stderr).trim();

  return {
    tool: "ast_project_scan",
    language: "project",
    matched: findings.length > 0,
    matchCount: findings.length,
    findings,
    searchedPaths: resolvedPaths.map((targetPath) => toDisplayPath(targetPath, options.cwd)),
    resolvedConfigPath: context.resolvedConfigPath,
    executionCwd: context.executionCwd,
    reportStyle,
    includeMetadata: Boolean(options.includeMetadata),
    ...(filter ? { filter } : {}),
    ...(options.maxResults !== undefined ? { maxResults: options.maxResults } : {}),
    ...(severity ? { severity } : {}),
    exitCode: result.exitCode,
    sgBinary: result.sgBinary,
    command: result.command,
    ...(stderr ? { stderr } : {}),
    ...(diagnosticOutput ? { diagnosticOutput } : {}),
  };
}
