import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

async function createTestableRunnerModule() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-runner-"));
  const modulePath = path.join(tmpDir, "runner.testable.ts");
  const sourcePath = path.join(process.cwd(), "runner.ts");
  const runnerCliPath = path.join(process.cwd(), "runner-cli.js");

  writeFile(
    path.join(tmpDir, "agents-stub.mjs"),
    "export {}\n",
  );

  writeFile(
    path.join(tmpDir, "runner-events-stub.mjs"),
    `export function processPiJsonLine() {
      return false;
    }
`,
  );

  writeFile(
    path.join(tmpDir, "types-stub.mjs"),
    `export const DEFAULT_CHILD_AGENT_ROLE = "worker";
     export function emptyUsage() {
      return {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        contextTokens: 0,
        turns: 0,
      };
     }
     export function getFinalOutput() {
      return "";
     }
     export function normalizeCompletedResult(result) {
      return result;
     }
`,
  );

  writeFile(path.join(tmpDir, "runner-cli-copy.mjs"), fs.readFileSync(runnerCliPath, "utf-8"));

  const source = fs
    .readFileSync(sourcePath, "utf-8")
    .replace('from "./agents.js"', 'from "./agents-stub.mjs"')
    .replace('from "./runner-cli.js"', 'from "./runner-cli-copy.mjs"')
    .replace('from "./runner-events.js"', 'from "./runner-events-stub.mjs"')
    .replace('from "./types.js"', 'from "./types-stub.mjs"');
  writeFile(modulePath, source);

  const moduleUrl = pathToFileURL(modulePath).href;
  const imported = await import(moduleUrl);
  return {
    ...imported,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

function makeAgent(overrides = {}) {
  return {
    name: "oracle",
    description: "Reviews changes",
    source: "user",
    systemPrompt: "You review.",
    filePath: "/tmp/oracle.md",
    ...overrides,
  };
}

function makeCliArgs(overrides = {}) {
  return {
    extensionArgs: [],
    alwaysProxy: [],
    fallbackModel: undefined,
    fallbackThinking: undefined,
    fallbackTools: undefined,
    fallbackNoTools: false,
    ...overrides,
  };
}

test("buildPiArgs merges agent tool allowlists with inherited non-builtin tools", async () => {
  const mod = await createTestableRunnerModule();
  try {
    const args = mod.buildPiArgs(
      makeAgent({ tools: ["read"] }),
      null,
      "Inspect the project",
      "spawn",
      null,
      ["lsp", "todo", "lsp"],
      makeCliArgs(),
    );

    assert.deepEqual(args, [
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--tools",
      "read,lsp,todo",
      "Task: Inspect the project",
    ]);
  } finally {
    mod.cleanup();
  }
});

test("buildPiArgs merges inherited parent --tools with inherited non-builtin tools", async () => {
  const mod = await createTestableRunnerModule();
  try {
    const args = mod.buildPiArgs(
      makeAgent(),
      null,
      "Inspect the project",
      "spawn",
      null,
      ["lsp", "todo"],
      makeCliArgs({ fallbackTools: "read,bash" }),
    );

    assert.deepEqual(args, [
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--tools",
      "read,bash,lsp,todo",
      "Task: Inspect the project",
    ]);
  } finally {
    mod.cleanup();
  }
});

test("buildPiArgs keeps inherited --no-tools authoritative", async () => {
  const mod = await createTestableRunnerModule();
  try {
    const args = mod.buildPiArgs(
      makeAgent({ tools: ["read"] }),
      null,
      "Inspect the project",
      "spawn",
      null,
      ["lsp", "todo"],
      makeCliArgs({ fallbackNoTools: true, fallbackTools: "read,bash" }),
    );

    assert.deepEqual(args, [
      "--mode",
      "json",
      "-p",
      "--no-session",
      "--no-tools",
      "Task: Inspect the project",
    ]);
  } finally {
    mod.cleanup();
  }
});
