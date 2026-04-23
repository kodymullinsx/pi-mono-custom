/**
 * Subagent process runner.
 *
 * Spawns isolated `pi` processes and streams results back via callbacks.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import type { AgentConfig } from "./agents.js";
import { parseInheritedCliArgs } from "./runner-cli.js";
import { processPiJsonLine } from "./runner-events.js";
import {
  type AgentRole,
  type DelegationMode,
  type MonitorOwnerEnv,
  type SingleResult,
  type SubagentDetails,
  DEFAULT_CHILD_AGENT_ROLE,
  emptyUsage,
  getFinalOutput,
  normalizeCompletedResult,
} from "./types.js";

const isWindows = process.platform === "win32";
const SIGKILL_TIMEOUT_MS = 5000;
const AGENT_END_GRACE_MS = 250;
const SUBAGENT_DEPTH_ENV = "PI_SUBAGENT_DEPTH";
const SUBAGENT_MAX_DEPTH_ENV = "PI_SUBAGENT_MAX_DEPTH";
const SUBAGENT_STACK_ENV = "PI_SUBAGENT_STACK";
const SUBAGENT_PREVENT_CYCLES_ENV = "PI_SUBAGENT_PREVENT_CYCLES";
const SUBAGENT_ROLE_ENV = "PI_SUBAGENT_ROLE";
const PI_OFFLINE_ENV = "PI_OFFLINE";
const PI_MONITOR_OWNER_SESSION_ID_ENV = "PI_MONITOR_OWNER_SESSION_ID";
const PI_MONITOR_OWNER_SESSION_FILE_ENV = "PI_MONITOR_OWNER_SESSION_FILE";
const PI_MONITOR_OWNER_CWD_ENV = "PI_MONITOR_OWNER_CWD";

type OnUpdateCallback = (partial: AgentToolResult<SubagentDetails>) => void;

// ---------------------------------------------------------------------------
// Process helpers
// ---------------------------------------------------------------------------

/**
 * Derive the spawn command from the current process context so child invocations
 * work on Unix and Windows without going through a shell wrapper.
 */
function resolvePiSpawn(): { command: string; prefixArgs: string[] } {
  const isNode = /[\\/]node(?:\.exe)?$/i.test(process.execPath);
  if (isNode && process.argv[1]) {
    return { command: process.execPath, prefixArgs: [process.argv[1]] };
  }
  return { command: process.execPath, prefixArgs: [] };
}

// ---------------------------------------------------------------------------
// Temp file helpers
// ---------------------------------------------------------------------------

function writePromptToTempFile(
  agentName: string,
  prompt: string,
): { dir: string; filePath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `prompt-${safeName}.md`);
  fs.writeFileSync(filePath, prompt, { encoding: "utf-8", mode: 0o600 });
  return { dir: tmpDir, filePath };
}

function writeForkSessionToTempFile(
  agentName: string,
  sessionJsonl: string,
): { dir: string; filePath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagent-"));
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `fork-${safeName}.jsonl`);
  fs.writeFileSync(filePath, sessionJsonl, { encoding: "utf-8", mode: 0o600 });
  return { dir: tmpDir, filePath };
}

function cleanupTempDir(dir: string | null): void {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Build pi CLI arguments
// ---------------------------------------------------------------------------

const inheritedCliArgs = parseInheritedCliArgs(process.argv);

function mergeToolNames(
  toolNames: string[],
  additionalToolNames: string[],
): string[] {
  const mergedToolNames: string[] = [];
  const seen = new Set<string>();
  for (const toolName of [...toolNames, ...additionalToolNames]) {
    const normalized = toolName.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    mergedToolNames.push(normalized);
  }
  return mergedToolNames;
}

function parseToolNames(raw: string): string[] {
  return raw
    .split(",")
    .map((toolName) => toolName.trim())
    .filter(Boolean);
}

export function buildPiArgs(
  agent: AgentConfig,
  systemPromptPath: string | null,
  task: string,
  delegationMode: DelegationMode,
  forkSessionPath: string | null,
  additionalToolNames: string[] = [],
  cliArgs = inheritedCliArgs,
): string[] {
  const args: string[] = [
    "--mode",
    "json",
    ...cliArgs.extensionArgs,
    ...cliArgs.alwaysProxy,
    "-p",
  ];

  if (delegationMode === "spawn") {
    args.push("--no-session");
  } else if (forkSessionPath) {
    args.push("--session", forkSessionPath);
  }

  const model = agent.model ?? cliArgs.fallbackModel;
  if (model) args.push("--model", model);

  const thinking = agent.thinking ?? cliArgs.fallbackThinking;
  if (thinking) args.push("--thinking", thinking);

  if (cliArgs.fallbackNoTools) {
    args.push("--no-tools");
  } else if (agent.tools && agent.tools.length > 0) {
    args.push(
      "--tools",
      mergeToolNames(agent.tools, additionalToolNames).join(","),
    );
  } else if (
    agent.tools === undefined &&
    cliArgs.fallbackTools !== undefined
  ) {
    args.push(
      "--tools",
      mergeToolNames(
        parseToolNames(cliArgs.fallbackTools),
        additionalToolNames,
      ).join(","),
    );
  }

  if (systemPromptPath) args.push("--append-system-prompt", systemPromptPath);
  args.push(`Task: ${task}`);
  return args;
}

interface BuildChildProcessEnvOptions {
  baseEnv?: NodeJS.ProcessEnv;
  role?: AgentRole;
  parentDepth: number;
  parentAgentStack: string[];
  agentName: string;
  maxDepth: number;
  preventCycles: boolean;
  monitorOwner?: MonitorOwnerEnv;
}

/** Build env vars propagated into child subagent processes. */
export function buildChildProcessEnv(
  opts: BuildChildProcessEnvOptions,
): NodeJS.ProcessEnv {
  const {
    baseEnv = process.env,
    role = DEFAULT_CHILD_AGENT_ROLE,
    parentDepth,
    parentAgentStack,
    agentName,
    maxDepth,
    preventCycles,
    monitorOwner,
  } = opts;

  const nextDepth = Math.max(0, Math.floor(parentDepth)) + 1;
  const propagatedMaxDepth = Math.max(0, Math.floor(maxDepth));
  const propagatedStack = [...parentAgentStack, agentName];
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    [SUBAGENT_DEPTH_ENV]: String(nextDepth),
    [SUBAGENT_MAX_DEPTH_ENV]: String(propagatedMaxDepth),
    [SUBAGENT_STACK_ENV]: JSON.stringify(propagatedStack),
    [SUBAGENT_PREVENT_CYCLES_ENV]: preventCycles ? "1" : "0",
    [SUBAGENT_ROLE_ENV]: role,
    [PI_OFFLINE_ENV]: "1",
  };

  if (monitorOwner?.sessionId !== undefined) {
    env[PI_MONITOR_OWNER_SESSION_ID_ENV] = monitorOwner.sessionId;
  }
  if (monitorOwner?.sessionFile !== undefined) {
    env[PI_MONITOR_OWNER_SESSION_FILE_ENV] = monitorOwner.sessionFile;
  }
  if (monitorOwner?.cwd !== undefined) {
    env[PI_MONITOR_OWNER_CWD_ENV] = monitorOwner.cwd;
  }

  return env;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RunAgentOptions {
  /** Fallback working directory when the task doesn't specify one. */
  cwd: string;
  /** All available agent configs. */
  agents: AgentConfig[];
  /** Name of the agent to run. */
  agentName: string;
  /** Task description. */
  task: string;
  /** Optional override working directory. */
  taskCwd?: string;
  /** Resolved child role for this delegated run. */
  role?: AgentRole;
  /** Explicitly requested role, if the caller supplied one. */
  requestedRole?: AgentRole;
  /** Active non-builtin tool names to preserve when a child allowlist is emitted. */
  additionalToolNames?: string[];
  /** Context mode: spawn (fresh) or fork (session snapshot + task). */
  delegationMode: DelegationMode;
  /** Serialized parent session snapshot used when delegationMode is "fork". */
  forkSessionSnapshotJsonl?: string;
  /** Current delegation depth of the caller process. */
  parentDepth: number;
  /** Delegation stack from the caller process (ancestor agent names). */
  parentAgentStack: string[];
  /** Maximum allowed delegation depth to propagate to child processes. */
  maxDepth: number;
  /** Whether cycle prevention should be enforced in child processes. */
  preventCycles: boolean;
  /** Durable monitor owner metadata to propagate into child processes. */
  monitorOwner?: MonitorOwnerEnv;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
  /** Streaming update callback. */
  onUpdate?: OnUpdateCallback;
  /** Factory to wrap results into SubagentDetails. */
  makeDetails: (results: SingleResult[]) => SubagentDetails;
}

/**
 * Spawn a single subagent process and collect its results.
 *
 * Returns a SingleResult even on failure (exitCode > 0, stderr populated).
 */
export async function runAgent(opts: RunAgentOptions): Promise<SingleResult> {
  const {
    cwd,
    agents,
    agentName,
    task,
    taskCwd,
    role = DEFAULT_CHILD_AGENT_ROLE,
    requestedRole,
    additionalToolNames = [],
    delegationMode,
    forkSessionSnapshotJsonl,
    parentDepth,
    parentAgentStack,
    maxDepth,
    preventCycles,
    monitorOwner,
    signal,
    onUpdate,
    makeDetails,
  } = opts;

  const agent = agents.find((a) => a.name === agentName);
  if (!agent) {
    const available = agents.map((a) => `"${a.name}"`).join(", ") || "none";
    return {
      agent: agentName,
      agentSource: "unknown",
      task,
      exitCode: 1,
      messages: [],
      stderr: `Unknown agent: "${agentName}". Available agents: ${available}.`,
      usage: emptyUsage(),
      role,
      requestedRole,
    };
  }

  if (
    delegationMode === "fork" &&
    (!forkSessionSnapshotJsonl || !forkSessionSnapshotJsonl.trim())
  ) {
    return {
      agent: agentName,
      agentSource: agent.source,
      task,
      exitCode: 1,
      messages: [],
      stderr:
        "Cannot run in fork mode: missing parent session snapshot context.",
      usage: emptyUsage(),
      model: agent.model,
      stopReason: "error",
      errorMessage:
        "Cannot run in fork mode: missing parent session snapshot context.",
      role,
      requestedRole,
    };
  }

  const result: SingleResult = {
    agent: agentName,
    agentSource: agent.source,
    task,
    exitCode: -1,
    messages: [],
    stderr: "",
    usage: emptyUsage(),
    model: agent.model,
    role,
    requestedRole,
  };

  const emitUpdate = () => {
    onUpdate?.({
      content: [
        {
          type: "text",
          text: getFinalOutput(result.messages) || "(running...)",
        },
      ],
      details: makeDetails([result]),
    });
  };

  // Write system prompt to temp file if needed
  let promptTmpDir: string | null = null;
  let promptTmpPath: string | null = null;
  if (agent.systemPrompt.trim()) {
    const tmp = writePromptToTempFile(agent.name, agent.systemPrompt);
    promptTmpDir = tmp.dir;
    promptTmpPath = tmp.filePath;
  }

  // Write forked session snapshot if needed
  let forkSessionTmpDir: string | null = null;
  let forkSessionTmpPath: string | null = null;
  if (delegationMode === "fork" && forkSessionSnapshotJsonl) {
    const tmp = writeForkSessionToTempFile(agent.name, forkSessionSnapshotJsonl);
    forkSessionTmpDir = tmp.dir;
    forkSessionTmpPath = tmp.filePath;
  }

  try {
    const piArgs = buildPiArgs(
      agent,
      promptTmpPath,
      task,
      delegationMode,
      forkSessionTmpPath,
      additionalToolNames,
    );
    let wasAborted = false;

    const exitCode = await new Promise<number>((resolve) => {
      const { command, prefixArgs } = resolvePiSpawn();
      const proc = spawn(command, [...prefixArgs, ...piArgs], {
        cwd: taskCwd ?? cwd,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        env: buildChildProcessEnv({
          role,
          parentDepth,
          parentAgentStack,
          agentName,
          maxDepth,
          preventCycles,
          monitorOwner,
        }),
      });

      proc.stdin.on("error", () => {
        /* ignore broken pipe on fast exits */
      });
      proc.stdin.end();

      let buffer = "";
      let didClose = false;
      let settled = false;
      let abortHandler: (() => void) | undefined;
      let semanticCompletionTimer: NodeJS.Timeout | undefined;

      const clearSemanticCompletionTimer = () => {
        if (semanticCompletionTimer) {
          clearTimeout(semanticCompletionTimer);
          semanticCompletionTimer = undefined;
        }
      };

      const terminateChild = () => {
        if (isWindows) {
          if (proc.pid !== undefined) {
            const killer = spawn("taskkill", ["/T", "/F", "/PID", String(proc.pid)], {
              stdio: "ignore",
            });
            killer.unref();
          }
          return;
        }

        proc.kill("SIGTERM");
        const sigkillTimer = setTimeout(() => {
          if (!didClose) proc.kill("SIGKILL");
        }, SIGKILL_TIMEOUT_MS);
        sigkillTimer.unref();
      };

      const finish = (code: number) => {
        if (settled) return;
        settled = true;
        clearSemanticCompletionTimer();
        if (signal && abortHandler) {
          signal.removeEventListener("abort", abortHandler);
        }
        resolve(code);
      };

      const flushLine = (line: string) => {
        if (processPiJsonLine(line, result)) emitUpdate();
        maybeFinishFromAgentEnd();
      };

      const flushBufferedLines = (text: string) => {
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) flushLine(line);
        }
      };

      const maybeFinishFromAgentEnd = () => {
        if (!result.sawAgentEnd || didClose || settled) return;
        clearSemanticCompletionTimer();
        semanticCompletionTimer = setTimeout(() => {
          if (didClose || settled || !result.sawAgentEnd) return;
          if (buffer.trim()) {
            flushBufferedLines(buffer);
            buffer = "";
          }
          proc.stdout.removeListener("data", onStdoutData);
          proc.stderr.removeListener("data", onStderrData);
          finish(0);
          terminateChild();
        }, AGENT_END_GRACE_MS);
        semanticCompletionTimer.unref();
      };

      const onStdoutData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";
        for (const line of lines) flushLine(line);
      };

      const onStderrData = (chunk: Buffer) => {
        result.stderr += chunk.toString();
      };

      proc.stdout.on("data", onStdoutData);
      proc.stderr.on("data", onStderrData);

      proc.on("close", (code) => {
        didClose = true;
        if (buffer.trim()) flushBufferedLines(buffer);
        finish(code ?? 0);
      });

      proc.on("error", (err) => {
        if (!result.stderr.trim()) result.stderr = err.message;
        finish(1);
      });

      // Abort handling
      if (signal) {
        abortHandler = () => {
          if (didClose || settled) return;
          wasAborted = true;
          terminateChild();
        };
        if (signal.aborted) abortHandler();
        else signal.addEventListener("abort", abortHandler, { once: true });
      }
    });

    result.exitCode = exitCode;
    return normalizeCompletedResult(result, wasAborted);
  } finally {
    cleanupTempDir(promptTmpDir);
    cleanupTempDir(forkSessionTmpDir);
  }
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

/**
 * Map over items with a bounded number of concurrent workers.
 */
export async function mapConcurrent<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>,
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
