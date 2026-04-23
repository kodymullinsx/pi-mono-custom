import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseProjectScanStream,
  parseRuleTestOutput,
  parseRuleTestSummary,
  stripAnsi,
} from "../cli.ts";
import { runAstDebugQuery, runAstProjectScan, runAstRuleTest } from "../index.ts";

const testRoot = path.dirname(new URL(import.meta.url).pathname);
const fixtureRoot = path.join(testRoot, "fixtures");
const projectCliRoot = path.join(fixtureRoot, "project-cli");
const cliOutputRoot = path.join(fixtureRoot, "cli-output");
const extensionRoot = path.dirname(testRoot);

async function withTempDir(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-ast-grep-cli-"));
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test("parseRuleTestSummary handles pass fixtures and ansi-colored output", async () => {
  const passOutput = await fs.readFile(path.join(cliOutputRoot, "rule-test-pass.txt"), "utf8");
  const summary = parseRuleTestSummary(passOutput);

  assert.deepEqual(summary, {
    status: "passed",
    passedCount: 2,
    failedCount: 0,
    totalCount: 2,
  });

  const colored = "\u001b[1;42;37mPASS\u001b[0m no-console-log\n\ntest result: \u001b[32mok\u001b[0m. 1 passed; 0 failed;";
  assert.equal(stripAnsi(colored), "PASS no-console-log\n\ntest result: ok. 1 passed; 0 failed;");
  assert.deepEqual(parseRuleTestSummary(colored), {
    status: "passed",
    passedCount: 1,
    failedCount: 0,
    totalCount: 1,
  });
});

test("parseRuleTestSummary handles failure fixtures", async () => {
  const failOutput = await fs.readFile(path.join(cliOutputRoot, "rule-test-fail.txt"), "utf8");
  const summary = parseRuleTestSummary(failOutput);

  assert.deepEqual(summary, {
    status: "failed",
    passedCount: 0,
    failedCount: 1,
    totalCount: 1,
  });
});

test("parseRuleTestOutput classifies noisy and missing failures", async () => {
  const output = await fs.readFile(path.join(cliOutputRoot, "rule-test-noisy-missing.txt"), "utf8");
  const parsed = parseRuleTestOutput(output);

  assert.deepEqual(parsed.summary, {
    status: "failed",
    passedCount: 0,
    failedCount: 1,
    totalCount: 1,
  });
  assert.deepEqual(parsed.cases, [
    { ruleId: "no-console-log", status: "failed", summary: "NM" },
  ]);
  assert.deepEqual(
    parsed.issues.map((issue) => issue.kind),
    ["unexpected_match", "missing_match"],
  );
  assert.equal(parsed.issues[0]?.ruleId, "no-console-log");
  assert.match(parsed.issues[0]?.snippet ?? "", /should have been invalid/);
  assert.match(parsed.issues[1]?.snippet ?? "", /logger\.info/);
  assert.deepEqual(parsed.notices, [
    {
      kind: "configuration_missing",
      ruleId: "no-debugger",
      message: "Configuration not found! no-debugger",
    },
  ]);
});

test("parseRuleTestOutput classifies missing snapshot failures", async () => {
  const output = await fs.readFile(path.join(cliOutputRoot, "rule-test-fail.txt"), "utf8");
  const parsed = parseRuleTestOutput(output);

  assert.deepEqual(parsed.cases, [
    { ruleId: "no-console-log", status: "failed", summary: ".W" },
  ]);
  assert.equal(parsed.issues[0]?.kind, "missing_snapshot");
  assert.equal(parsed.issues[0]?.ruleId, "no-console-log");
  assert.match(parsed.issues[0]?.message ?? "", /baseline found/);
});

test("parseProjectScanStream preserves structured scan fields", async () => {
  const stream = await fs.readFile(path.join(cliOutputRoot, "scan-stream.jsonl"), "utf8");
  const findings = parseProjectScanStream(stream, projectCliRoot, projectCliRoot);

  assert.equal(findings.length, 4);
  assert.deepEqual(
    findings.map((finding) => finding.file).sort(),
    ["src/index.html", "src/sample.ts", "src/sample.ts", "src/sample.ts"],
  );

  const consoleFinding = findings.find((finding) => finding.ruleId === "no-console-log");
  assert.equal(consoleFinding?.replacement, 'logger.info("bad")');
  assert.deepEqual(consoleFinding?.range.byteOffset, { start: 0, end: 18 });
  assert.deepEqual(consoleFinding?.metaVariables?.single?.ARG?.range?.byteOffset, { start: 12, end: 17 });
  assert.equal(consoleFinding?.labels?.[0]?.message, "Console log argument");
  assert.equal(consoleFinding?.labels?.[0]?.style, "primary");
  assert.deepEqual(consoleFinding?.metadata, {
    owner: "pi",
    category: "hygiene",
  });

  const alertFinding = findings.find((finding) => finding.ruleId === "no-alert");
  assert.equal(alertFinding?.file, "src/index.html");
  assert.equal(alertFinding?.language, "JavaScript");
  assert.equal(alertFinding?.metaVariables?.single?.MSG?.text, '"hi"');
});

test("runAstDebugQuery supports config-aware parse inspection and sexp output", async () => {
  const result = await runAstDebugQuery(
    {
      language: "typescript",
      query: "console.log($ARG)",
      selector: "call_expression",
      strictness: "template",
      configPath: "test/fixtures/project-cli/sgconfig.yml",
      format: "sexp",
    },
    extensionRoot,
  );

  assert.equal(result.tool, "ast_debug_query");
  assert.equal(result.language, "typescript");
  assert.equal(result.exitCode, 1);
  assert.equal(result.selector, "call_expression");
  assert.equal(result.strictness, "template");
  assert.equal(result.resolvedConfigPath, "test/fixtures/project-cli/sgconfig.yml");
  assert.match(result.output, /call_expression/);
  assert.doesNotMatch(result.output, /fixtures\/sample\.ts/);
  assert.doesNotMatch(result.output, /node_modules/);
});

test("runAstRuleTest discovers config from testDir and returns structured passes without includeOff", async () => {
  const result = await runAstRuleTest(
    {
      testDir: "test/fixtures/project-cli/rule-tests",
    },
    extensionRoot,
  );

  assert.equal(result.passed, true);
  assert.deepEqual(result.summary, {
    status: "passed",
    passedCount: 1,
    failedCount: 0,
    totalCount: 1,
  });
  assert.deepEqual(result.cases, [
    { ruleId: "no-console-log", status: "passed", summary: ".." },
  ]);
  assert.deepEqual(result.notices, [
    {
      kind: "severity_off_excluded",
      ruleId: "no-debugger",
      message: "Rule no-debugger exists but is severity: off, so sg test excluded it. Re-run with includeOff to test it.",
      rawMessage: "Configuration not found! no-debugger",
      hint: "Pass includeOff: true to include severity: off rules.",
    },
  ]);
  assert.equal(result.resolvedConfigPath, "test/fixtures/project-cli/sgconfig.yml");
  assert.equal(result.resolvedTestDir, "test/fixtures/project-cli/rule-tests");
});

test("runAstRuleTest includes severity-off rules when requested", async () => {
  const result = await runAstRuleTest(
    {
      testDir: "test/fixtures/project-cli/rule-tests",
      includeOff: true,
    },
    extensionRoot,
  );

  assert.equal(result.passed, true);
  assert.deepEqual(result.summary, {
    status: "passed",
    passedCount: 2,
    failedCount: 0,
    totalCount: 2,
  });
  assert.deepEqual(
    result.cases.map((entry) => entry.ruleId).sort(),
    ["no-console-log", "no-debugger"],
  );
  assert.equal(result.notices.length, 0);
  assert.match(result.rawOutput, /Running 2 tests/);
});

test("runAstRuleTest returns structured failure output when snapshots are missing", async () => {
  await withTempDir(async (root) => {
    await fs.cp(projectCliRoot, root, { recursive: true });
    await fs.rm(path.join(root, "rule-tests", "__snapshots__", "no-console-log-snapshot.yml"), { force: true });

    const result = await runAstRuleTest(
      {
        testDir: path.join(root, "rule-tests"),
      },
      root,
    );

    assert.equal(result.passed, false);
    assert.equal(result.exitCode, 4);
    assert.deepEqual(result.summary, {
      status: "failed",
      passedCount: 0,
      failedCount: 1,
      totalCount: 1,
    });
    assert.equal(result.cases[0]?.ruleId, "no-console-log");
    assert.equal(result.issues[0]?.kind, "missing_snapshot");
    assert.match(result.rawOutput, /No no-console-log baseline found/);
  });
});

test("runAstRuleTest classifies noisy and missing live failures", async () => {
  await withTempDir(async (root) => {
    await fs.cp(projectCliRoot, root, { recursive: true });
    await fs.writeFile(
      path.join(root, "rule-tests", "no-console-log-test.yml"),
      [
        "id: no-console-log",
        "valid:",
        "  - 'console.log(\"should have been invalid\")'",
        "invalid:",
        "  - 'logger.info(\"safe\")'",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = await runAstRuleTest(
      {
        testDir: path.join(root, "rule-tests"),
      },
      root,
    );

    assert.equal(result.passed, false);
    assert.deepEqual(
      result.issues.map((issue) => issue.kind),
      ["unexpected_match", "missing_match"],
    );
    assert.match(result.issues[0]?.snippet ?? "", /should have been invalid/);
    assert.match(result.issues[1]?.snippet ?? "", /logger\.info/);
  });
});

test("runAstProjectScan discovers config from nested paths and returns structured findings", async () => {
  const result = await runAstProjectScan(
    {
      paths: ["test/fixtures/project-cli/src"],
      includeMetadata: true,
    },
    extensionRoot,
  );

  assert.equal(result.matchCount, 3);
  assert.deepEqual(result.searchedPaths, ["test/fixtures/project-cli/src"]);
  assert.equal(result.resolvedConfigPath, "test/fixtures/project-cli/sgconfig.yml");
  assert.equal(result.executionCwd, "test/fixtures/project-cli");
  assert.ok(result.findings.some((finding) => finding.ruleId === "no-alert" && finding.file === "test/fixtures/project-cli/src/index.html"));

  const consoleFinding = result.findings.find((finding) => finding.ruleId === "no-console-log");
  assert.equal(consoleFinding?.replacement, 'logger.info("bad")');
  assert.equal(consoleFinding?.labels?.[0]?.message, "Console log argument");
  assert.deepEqual(consoleFinding?.metadata, {
    owner: "pi",
    category: "hygiene",
  });
});

test("runAstProjectScan discovers config from cwd when paths are omitted", async () => {
  const result = await runAstProjectScan(
    {
      includeMetadata: true,
    },
    projectCliRoot,
  );

  assert.equal(result.matchCount, 3);
  assert.deepEqual(result.searchedPaths, ["."]);
  assert.equal(result.resolvedConfigPath, "sgconfig.yml");
  assert.equal(result.executionCwd, ".");
});

test("runAstProjectScan applies severity overrides and filter/maxResults", async () => {
  const withOverride = await runAstProjectScan(
    {
      paths: ["test/fixtures/project-cli/src"],
      includeMetadata: true,
      severity: { warning: ["no-debugger"] },
    },
    extensionRoot,
  );

  assert.equal(withOverride.matchCount, 4);
  assert.ok(withOverride.findings.some((finding) => finding.ruleId === "no-debugger"));

  const withDiagnostic = await runAstProjectScan(
    {
      paths: ["test/fixtures/project-cli/src"],
      reportStyle: "short",
    },
    extensionRoot,
  );

  assert.match(withDiagnostic.diagnosticOutput ?? "", /warning\[(no-console-log|no-alert)\]:/);

  const filtered = await runAstProjectScan(
    {
      paths: ["test/fixtures/project-cli/src"],
      filter: "no-console-log",
      maxResults: 1,
    },
    extensionRoot,
  );

  assert.equal(filtered.matchCount, 1);
  assert.deepEqual(filtered.findings.map((finding) => finding.ruleId), ["no-console-log"]);
});
