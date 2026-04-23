import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseInheritedCliArgs } from "../runner-cli.js";

test("forwards safe parent CLI flags and captures fallback model settings", () => {
  const parsed = parseInheritedCliArgs([
    "/usr/bin/node",
    "pi",
    "--provider",
    "openrouter",
    "--api-key=secret",
    "--theme",
    "dark",
    "--skill",
    "research",
    "--model",
    "anthropic/claude-3-7-sonnet",
    "--thinking=high",
    "--tools",
    "read,bash",
    "--no-session",
    "--mode",
    "json",
    "--append-system-prompt",
    "/tmp/prompt.md",
    "--subagent-max-depth",
    "2",
    "--subagent-prevent-cycles",
    "true",
    "--custom-flag",
    "value",
    "positional prompt text",
  ]);

  assert.deepEqual(parsed.extensionArgs, []);
  assert.deepEqual(parsed.alwaysProxy, [
    "--provider",
    "openrouter",
    "--api-key",
    "secret",
    "--theme",
    "dark",
    "--skill",
    "research",
    "--append-system-prompt",
    "/tmp/prompt.md",
    "--custom-flag",
    "value",
  ]);
  assert.equal(parsed.fallbackModel, "anthropic/claude-3-7-sonnet");
  assert.equal(parsed.fallbackThinking, "high");
  assert.equal(parsed.fallbackTools, "read,bash");
  assert.equal(parsed.fallbackNoTools, false);
});

test("resolves relative extension paths against the parent cwd", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-cli-"));
  const extensionDir = path.resolve(tmpDir, "local-extension");
  fs.mkdirSync(extensionDir);

  const previousCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    const expectedExtensionDir = path.resolve(process.cwd(), "local-extension");

    const parsed = parseInheritedCliArgs([
      "/usr/bin/node",
      "pi",
      "-e",
      "./local-extension",
      "--extension=git:github.com/example/other-extension",
      "--no-extensions",
    ]);

    assert.deepEqual(parsed.extensionArgs, [
      "-e",
      expectedExtensionDir,
      "--extension",
      "git:github.com/example/other-extension",
      "--no-extensions",
    ]);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("resolves inherited relative resource paths against the parent cwd", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-cli-"));
  const skillPath = path.resolve(tmpDir, "skills", "research", "SKILL.md");
  const promptPath = path.resolve(tmpDir, "prompts", "review.md");
  const themePath = path.resolve(tmpDir, "themes", "custom.json");
  const sessionDir = path.resolve(tmpDir, ".sessions", "nested");

  fs.mkdirSync(path.dirname(skillPath), { recursive: true });
  fs.mkdirSync(path.dirname(promptPath), { recursive: true });
  fs.mkdirSync(path.dirname(themePath), { recursive: true });
  fs.writeFileSync(skillPath, "# skill\n");
  fs.writeFileSync(promptPath, "# prompt\n");
  fs.writeFileSync(themePath, "{}\n");

  const previousCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    const expectedSkillPath = path.resolve(process.cwd(), "skills", "research", "SKILL.md");
    const expectedPromptPath = path.resolve(process.cwd(), "prompts", "review.md");
    const expectedThemePath = path.resolve(process.cwd(), "themes", "custom.json");
    const expectedSessionDir = path.resolve(process.cwd(), ".sessions", "nested");

    const parsed = parseInheritedCliArgs([
      "/usr/bin/node",
      "pi",
      "--skill",
      "./skills/research/SKILL.md",
      "--prompt-template",
      "prompts/review.md",
      "--theme",
      "dark",
      "--theme",
      "my-org/dark",
      "--theme",
      "./themes/custom.json",
      "--session-dir",
      "./.sessions/nested",
      "--append-system-prompt",
      "./prompts/review.md",
      "--append-system-prompt",
      "Be concise",
      "--system-prompt",
      "You are helpful",
    ]);

    assert.deepEqual(parsed.alwaysProxy, [
      "--skill",
      expectedSkillPath,
      "--prompt-template",
      expectedPromptPath,
      "--theme",
      "dark",
      "--theme",
      "my-org/dark",
      "--theme",
      expectedThemePath,
      "--session-dir",
      expectedSessionDir,
      "--append-system-prompt",
      expectedPromptPath,
      "--append-system-prompt",
      "Be concise",
      "--system-prompt",
      "You are helpful",
    ]);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("preserves append-system-prompt order while distinguishing file-like values from inline text", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-cli-"));

  const previousCwd = process.cwd();
  process.chdir(tmpDir);

  try {
    const expectedRelativeWithExtension = path.resolve(process.cwd(), "prompts", "missing.md");
    const expectedImplicitFileLike = path.resolve(process.cwd(), "notes", "prompt.md");

    const parsed = parseInheritedCliArgs([
      "/usr/bin/node",
      "pi",
      "--append-system-prompt",
      "./prompts/missing.md",
      "--append-system-prompt",
      "notes/prompt",
      "--append-system-prompt",
      "inline-text",
      "--append-system-prompt",
      "notes/prompt.md",
    ]);

    assert.deepEqual(parsed.alwaysProxy, [
      "--append-system-prompt",
      expectedRelativeWithExtension,
      "--append-system-prompt",
      "notes/prompt",
      "--append-system-prompt",
      "inline-text",
      "--append-system-prompt",
      expectedImplicitFileLike,
    ]);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("inherits no-tools when the parent disabled tools", () => {
  const parsed = parseInheritedCliArgs([
    "/usr/bin/node",
    "pi",
    "--no-tools",
  ]);

  assert.equal(parsed.fallbackTools, undefined);
  assert.equal(parsed.fallbackNoTools, true);
});
