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

async function createTestableIndexModule() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-index-monitor-"));
  const modulePath = path.join(tmpDir, "index.testable.ts");
  const sourcePath = path.join(process.cwd(), "index.ts");

  writeFile(
    path.join(tmpDir, "typebox-stub.mjs"),
    `export const Type = {
      String: (options = {}) => ({ type: "string", ...options }),
      Boolean: (options = {}) => ({ type: "boolean", ...options }),
      Array: (item, options = {}) => ({ type: "array", item, ...options }),
      Object: (shape, options = {}) => ({ type: "object", shape, ...options }),
      Optional: (value) => ({ ...value, optional: true }),
    };
`,
  );
  writeFile(path.join(tmpDir, "agents-stub.mjs"), `export function discoverAgents() { return { agents: [], projectAgentsDir: null }; }`);
  writeFile(path.join(tmpDir, "render-stub.mjs"), `export function renderCall(args) { return args; } export function renderResult(result) { return result; }`);
  writeFile(path.join(tmpDir, "runner-events-stub.mjs"), `export function getResultSummaryText(result) { return result.task || result.agent || "done"; }`);
  writeFile(path.join(tmpDir, "runner-stub.mjs"), `export async function runAgent() { throw new Error("not used"); } export async function mapConcurrent(items, _limit, fn) { return Promise.all(items.map((item, index) => fn(item, index))); }`);
  writeFile(
    path.join(tmpDir, "types-stub.mjs"),
    `export const DEFAULT_DELEGATION_MODE = "spawn";
     export const DEFAULT_CHILD_AGENT_ROLE = "worker";
     export const DEFAULT_ROOT_AGENT_ROLE = "coordinator";
     export function parseAgentRole(raw) {
      if (typeof raw !== "string") return null;
      const normalized = raw.trim().toLowerCase();
      return normalized === "coordinator" || normalized === "worker" ? normalized : null;
     }
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
     export function isResultError(result) { return result.exitCode !== 0; }
     export function isResultSuccess(result) { return result.exitCode === 0; }
`,
  );

  const source = fs
    .readFileSync(sourcePath, "utf-8")
    .replace('from "@sinclair/typebox"', 'from "./typebox-stub.mjs"')
    .replace('from "./agents.js"', 'from "./agents-stub.mjs"')
    .replace('from "./render.js"', 'from "./render-stub.mjs"')
    .replace('from "./runner-events.js"', 'from "./runner-events-stub.mjs"')
    .replace('from "./runner.js"', 'from "./runner-stub.mjs"')
    .replace('from "./types.js"', 'from "./types-stub.mjs"');
  writeFile(modulePath, source);

  const imported = await import(pathToFileURL(modulePath).href);
  return {
    ...imported,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

async function createTestableRunnerModule() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-runner-monitor-"));
  const modulePath = path.join(tmpDir, "runner.testable.ts");
  const sourcePath = path.join(process.cwd(), "runner.ts");

  writeFile(path.join(tmpDir, "agents-stub.mjs"), `export {};`);
  writeFile(
    path.join(tmpDir, "runner-cli-stub.mjs"),
    `export function parseInheritedCliArgs() {
      return {
        extensionArgs: [],
        alwaysProxy: [],
        fallbackModel: undefined,
        fallbackThinking: undefined,
        fallbackTools: undefined,
        fallbackNoTools: false,
      };
    }
`,
  );
  writeFile(
    path.join(tmpDir, "runner-events-stub.mjs"),
    `export function processPiJsonLine() { return false; }
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
     export function getFinalOutput() { return ""; }
     export function normalizeCompletedResult(result) { return result; }
`,
  );

  const source = fs
    .readFileSync(sourcePath, "utf-8")
    .replace('from "./agents.js"', 'from "./agents-stub.mjs"')
    .replace('from "./runner-cli.js"', 'from "./runner-cli-stub.mjs"')
    .replace('from "./runner-events.js"', 'from "./runner-events-stub.mjs"')
    .replace('from "./types.js"', 'from "./types-stub.mjs"');
  writeFile(modulePath, source);

  const imported = await import(pathToFileURL(modulePath).href);
  return {
    ...imported,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

test("resolveMonitorOwnerEnv prefers inherited owner metadata when present", async () => {
  const mod = await createTestableIndexModule();
  try {
    const owner = mod.resolveMonitorOwnerEnv(
      {
        PI_MONITOR_OWNER_SESSION_ID: "root-session",
        PI_MONITOR_OWNER_SESSION_FILE: "/tmp/root.jsonl",
        PI_MONITOR_OWNER_CWD: "/workspace/root",
      },
      {
        getHeader: () => ({ id: "header" }),
        getBranch: () => [],
        getSessionId: () => "child-session",
        getSessionFile: () => "/tmp/child.jsonl",
      },
      "/workspace/child",
    );

    assert.deepEqual(owner, {
      sessionId: "root-session",
      sessionFile: "/tmp/root.jsonl",
      cwd: "/workspace/root",
    });
  } finally {
    mod.cleanup();
  }
});

test("resolveMonitorOwnerEnv falls back to current session metadata when env is absent", async () => {
  const mod = await createTestableIndexModule();
  try {
    const owner = mod.resolveMonitorOwnerEnv(
      {},
      {
        getHeader: () => ({ id: "header" }),
        getBranch: () => [],
        getSessionId: () => "current-session",
        getSessionFile: () => "/tmp/current.jsonl",
      },
      "/workspace/current",
    );

    assert.deepEqual(owner, {
      sessionId: "current-session",
      sessionFile: "/tmp/current.jsonl",
      cwd: "/workspace/current",
    });
  } finally {
    mod.cleanup();
  }
});

test("resolveMonitorOwnerEnv fails closed when durable session metadata is unavailable", async () => {
  const mod = await createTestableIndexModule();
  try {
    const owner = mod.resolveMonitorOwnerEnv(
      {},
      {
        getHeader: () => ({ id: "header" }),
        getBranch: () => [],
        getSessionId: () => null,
        getSessionFile: () => null,
      },
      "/workspace/current",
    );

    assert.deepEqual(owner, {});
  } finally {
    mod.cleanup();
  }
});

test("buildChildProcessEnv propagates role and monitor owner env vars to child processes", async () => {
  const mod = await createTestableRunnerModule();
  try {
    const env = mod.buildChildProcessEnv({
      baseEnv: { EXISTING: "1" },
      role: "coordinator",
      parentDepth: 1,
      parentAgentStack: ["planner"],
      agentName: "reviewer",
      maxDepth: 3,
      preventCycles: true,
      monitorOwner: {
        sessionId: "root-session",
        sessionFile: "/tmp/root.jsonl",
        cwd: "/workspace/root",
      },
    });

    assert.equal(env.EXISTING, "1");
    assert.equal(env.PI_SUBAGENT_DEPTH, "2");
    assert.equal(env.PI_SUBAGENT_MAX_DEPTH, "3");
    assert.equal(env.PI_SUBAGENT_STACK, JSON.stringify(["planner", "reviewer"]));
    assert.equal(env.PI_SUBAGENT_PREVENT_CYCLES, "1");
    assert.equal(env.PI_SUBAGENT_ROLE, "coordinator");
    assert.equal(env.PI_MONITOR_OWNER_SESSION_ID, "root-session");
    assert.equal(env.PI_MONITOR_OWNER_SESSION_FILE, "/tmp/root.jsonl");
    assert.equal(env.PI_MONITOR_OWNER_CWD, "/workspace/root");
  } finally {
    mod.cleanup();
  }
});
