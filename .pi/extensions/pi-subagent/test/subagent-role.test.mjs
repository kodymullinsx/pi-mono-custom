import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function emptyUsage() {
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

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

async function createTestableIndexModule() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-index-"));
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

  writeFile(
    path.join(tmpDir, "agents-stub.mjs"),
    `export function discoverAgents() {
      return globalThis.__PI_SUBAGENT_TEST_DISCOVERY__ ?? { agents: [], projectAgentsDir: null };
    }
`,
  );

  writeFile(
    path.join(tmpDir, "render-stub.mjs"),
    `export function renderCall(args) { return args; }
     export function renderResult(result) { return result; }
`,
  );

  writeFile(
    path.join(tmpDir, "runner-events-stub.mjs"),
    `export function getResultSummaryText(result) {
      return result.errorMessage || result.task || result.agent || "done";
    }
`,
  );

  writeFile(
    path.join(tmpDir, "runner-stub.mjs"),
    `const emptyUsage = () => ({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      contextTokens: 0,
      turns: 0,
    });
     export async function runAgent(opts) {
      globalThis.__PI_SUBAGENT_RUNS__ ??= [];
      globalThis.__PI_SUBAGENT_RUNS__.push(opts);
      if (typeof globalThis.__PI_SUBAGENT_RUN_AGENT__ === "function") {
        return globalThis.__PI_SUBAGENT_RUN_AGENT__(opts);
      }
      return {
        agent: opts.agentName,
        agentSource: "user",
        task: opts.task,
        exitCode: 0,
        messages: [],
        stderr: "",
        usage: emptyUsage(),
        role: opts.role,
        requestedRole: opts.requestedRole,
      };
    }
    export async function mapConcurrent(items, _limit, fn) {
      return Promise.all(items.map((item, index) => fn(item, index)));
    }
`,
  );

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
     export function isResultError(result) {
      return result.exitCode !== 0;
     }
     export function isResultSuccess(result) {
      return result.exitCode === 0;
     }
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

  const moduleUrl = pathToFileURL(modulePath).href;
  const imported = await import(moduleUrl);
  return {
    ...imported,
    cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
  };
}

function createFakePi(flags = {}, toolState = {}) {
  const tools = [];
  const handlers = new Map();
  const registeredFlags = [];
  const allTools = toolState.allTools ?? [];
  const activeTools = toolState.activeTools ?? allTools.map((tool) => tool.name);
  return {
    tools,
    handlers,
    registeredFlags,
    registerFlag(name, config) {
      registeredFlags.push({ name, config });
    },
    getFlag(name) {
      return flags[name];
    },
    getAllTools() {
      return allTools;
    },
    getActiveTools() {
      return activeTools;
    },
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
    registerTool(tool) {
      tools.push(tool);
    },
  };
}

function createCtx(overrides = {}) {
  return {
    cwd: "/workspace/app",
    hasUI: false,
    sessionManager: {
      getHeader: () => ({ id: "root-header", timestamp: 1 }),
      getBranch: () => [{ id: "entry-1" }],
      getSessionId: () => "session-root",
      getSessionFile: () => "/tmp/session-root.jsonl",
    },
    ui: {
      confirm: async () => true,
    },
    ...overrides,
  };
}

function withEnv(overrides, fn) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("resolveCurrentSessionRole defaults root to coordinator and delegated children to worker", async () => {
  const mod = await createTestableIndexModule();
  try {
    assert.equal(mod.resolveCurrentSessionRole(0, undefined), "coordinator");
    assert.equal(mod.resolveCurrentSessionRole(1, undefined), "worker");
    assert.equal(mod.resolveCurrentSessionRole(2, "coordinator"), "coordinator");
  } finally {
    mod.cleanup();
  }
});

test("resolveChildRole uses per-task, then top-level, then agent default, then worker fallback", async () => {
  const mod = await createTestableIndexModule();
  try {
    assert.equal(
      mod.resolveChildRole("worker", "coordinator", "coordinator"),
      "worker",
    );
    assert.equal(
      mod.resolveChildRole(undefined, "coordinator", "worker"),
      "coordinator",
    );
    assert.equal(
      mod.resolveChildRole(undefined, undefined, "coordinator"),
      "coordinator",
    );
    assert.equal(
      mod.resolveChildRole(undefined, undefined, undefined),
      "worker",
    );
  } finally {
    mod.cleanup();
  }
});

test("worker sessions do not register the subagent tool", async () => {
  const mod = await createTestableIndexModule();
  try {
    await withEnv(
      {
        PI_SUBAGENT_DEPTH: "1",
        PI_SUBAGENT_ROLE: undefined,
      },
      async () => {
        const pi = createFakePi();
        mod.default(pi);
        assert.equal(pi.tools.length, 0);
      },
    );
  } finally {
    mod.cleanup();
  }
});

test("coordinator sessions register the subagent tool and pass resolved single-run role to runner", async () => {
  const mod = await createTestableIndexModule();
  try {
    globalThis.__PI_SUBAGENT_TEST_DISCOVERY__ = {
      agents: [
        {
          name: "planner",
          description: "Plans work",
          role: "worker",
          source: "user",
          systemPrompt: "You plan.",
        },
      ],
      projectAgentsDir: null,
    };
    globalThis.__PI_SUBAGENT_RUNS__ = [];

    await withEnv(
      {
        PI_SUBAGENT_DEPTH: undefined,
        PI_SUBAGENT_ROLE: undefined,
        PI_MONITOR_OWNER_SESSION_ID: undefined,
        PI_MONITOR_OWNER_SESSION_FILE: undefined,
        PI_MONITOR_OWNER_CWD: undefined,
      },
      async () => {
        const pi = createFakePi();
        mod.default(pi);
        assert.equal(pi.tools.length, 1);

        const tool = pi.tools[0];
        const result = await tool.execute(
          "call-1",
          {
            agent: "planner",
            task: "Continue coordinating this thread",
            mode: "fork",
            role: "coordinator",
          },
          undefined,
          undefined,
          createCtx(),
        );

        assert.equal(result.isError, undefined);
        assert.equal(globalThis.__PI_SUBAGENT_RUNS__.length, 1);
        const [run] = globalThis.__PI_SUBAGENT_RUNS__;
        assert.equal(run.role, "coordinator");
        assert.equal(run.requestedRole, "coordinator");
        assert.equal(run.delegationMode, "fork");
        assert.match(run.forkSessionSnapshotJsonl, /root-header/);
        assert.deepEqual(run.monitorOwner, {
          sessionId: "session-root",
          sessionFile: "/tmp/session-root.jsonl",
          cwd: "/workspace/app",
        });
      },
    );
  } finally {
    delete globalThis.__PI_SUBAGENT_TEST_DISCOVERY__;
    delete globalThis.__PI_SUBAGENT_RUNS__;
    delete globalThis.__PI_SUBAGENT_RUN_AGENT__;
    mod.cleanup();
  }
});

test("parallel calls honor per-task role overrides over top-level and agent defaults", async () => {
  const mod = await createTestableIndexModule();
  try {
    globalThis.__PI_SUBAGENT_TEST_DISCOVERY__ = {
      agents: [
        {
          name: "writer",
          description: "Writes docs",
          role: "worker",
          source: "user",
          systemPrompt: "You write.",
        },
        {
          name: "planner",
          description: "Plans work",
          role: "worker",
          source: "user",
          systemPrompt: "You plan.",
        },
      ],
      projectAgentsDir: null,
    };
    globalThis.__PI_SUBAGENT_RUNS__ = [];

    await withEnv(
      {
        PI_SUBAGENT_DEPTH: undefined,
        PI_SUBAGENT_ROLE: undefined,
      },
      async () => {
        const pi = createFakePi();
        mod.default(pi);
        const tool = pi.tools[0];

        await tool.execute(
          "call-1",
          {
            tasks: [
              { agent: "writer", task: "Draft README section", role: "worker" },
              { agent: "planner", task: "Coordinate remaining work" },
            ],
            role: "coordinator",
            mode: "spawn",
          },
          undefined,
          undefined,
          createCtx(),
        );

        assert.equal(globalThis.__PI_SUBAGENT_RUNS__.length, 2);
        assert.equal(globalThis.__PI_SUBAGENT_RUNS__[0].role, "worker");
        assert.equal(globalThis.__PI_SUBAGENT_RUNS__[0].requestedRole, "worker");
        assert.equal(globalThis.__PI_SUBAGENT_RUNS__[1].role, "coordinator");
        assert.equal(globalThis.__PI_SUBAGENT_RUNS__[1].requestedRole, undefined);
      },
    );
  } finally {
    delete globalThis.__PI_SUBAGENT_TEST_DISCOVERY__;
    delete globalThis.__PI_SUBAGENT_RUNS__;
    delete globalThis.__PI_SUBAGENT_RUN_AGENT__;
    mod.cleanup();
  }
});

test("child runs preserve active non-builtin tools and exclude subagent for worker children", async () => {
  const mod = await createTestableIndexModule();
  try {
    globalThis.__PI_SUBAGENT_TEST_DISCOVERY__ = {
      agents: [
        {
          name: "writer",
          description: "Writes docs",
          role: "worker",
          source: "user",
          systemPrompt: "You write.",
        },
        {
          name: "planner",
          description: "Plans work",
          role: "coordinator",
          source: "user",
          systemPrompt: "You plan.",
        },
      ],
      projectAgentsDir: null,
    };
    globalThis.__PI_SUBAGENT_RUNS__ = [];

    await withEnv(
      {
        PI_SUBAGENT_DEPTH: undefined,
        PI_SUBAGENT_ROLE: undefined,
      },
      async () => {
        const pi = createFakePi(
          {},
          {
            allTools: [
              { name: "read", sourceInfo: { source: "builtin" } },
              { name: "lsp", sourceInfo: { source: "local" } },
              { name: "todo", sourceInfo: { source: "sdk" } },
              { name: "subagent", sourceInfo: { source: "local" } },
            ],
            activeTools: ["read", "lsp", "todo", "subagent"],
          },
        );
        mod.default(pi);
        const tool = pi.tools[0];

        await tool.execute(
          "call-1",
          {
            tasks: [
              { agent: "writer", task: "Inspect the current file", role: "worker" },
              { agent: "planner", task: "Coordinate the next steps", role: "coordinator" },
            ],
            mode: "spawn",
          },
          undefined,
          undefined,
          createCtx(),
        );

        assert.equal(globalThis.__PI_SUBAGENT_RUNS__.length, 2);
        assert.deepEqual(globalThis.__PI_SUBAGENT_RUNS__[0].additionalToolNames, ["lsp", "todo"]);
        assert.deepEqual(globalThis.__PI_SUBAGENT_RUNS__[1].additionalToolNames, ["lsp", "todo", "subagent"]);
      },
    );
  } finally {
    delete globalThis.__PI_SUBAGENT_TEST_DISCOVERY__;
    delete globalThis.__PI_SUBAGENT_RUNS__;
    delete globalThis.__PI_SUBAGENT_RUN_AGENT__;
    mod.cleanup();
  }
});
