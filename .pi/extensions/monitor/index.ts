import { Box, Text } from "@mariozechner/pi-tui";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { closeSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  ACTIVE_MONITOR_STATUSES,
  EVENT_POLL_INTERVAL_MS,
  MAX_WAKE_LINES_PER_MONITOR,
  MONITOR_EVENT_TYPE,
  MONITOR_STATUS_KEY,
  STATUS_REFRESH_INTERVAL_MS,
  buildWakePayload,
  claimPendingEvents,
  countPendingEventsForOwner,
  createInitialMonitorState,
  createLogPath,
  createMonitorDirs,
  ensureMonitorDirs,
  filterMonitorStatesForOwner,
  formatMonitorList,
  formatMonitorStatus,
  generateMonitorId,
  hasDurableOwner,
  hasOwnerIdentity,
  listMonitorStates,
  monitorMatchesOwner,
  moveClaimsToDelivered,
  readMonitorState,
  reconcileDeadMonitors,
  requeueStaleProcessingEvents,
  resolveCurrentSessionIdentity,
  resolveDurableOwner,
  resolveMonitorCwd,
  resolveMonitorName,
  resolveMonitorStateRoot,
  restoreClaimsToPending,
  writeMonitorState,
  isProcessAlive,
} from "./core.js";

type MonitorAction = "start" | "stop" | "list" | "status";

interface MonitorToolParams {
  action?: string;
  command?: string;
  name?: string;
  cwd?: string;
  monitorId?: string;
}

interface ParsedMonitorStartArgs {
  command: string;
  name?: string;
  cwd?: string;
}

const runnerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "runner.mjs");

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasChildExited(child: { exitCode: number | null; signalCode: NodeJS.Signals | null }): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function waitForChildExit(
  child: { exitCode: number | null; signalCode: NodeJS.Signals | null; once: (event: "exit", listener: () => void) => void; off: (event: "exit", listener: () => void) => void },
  timeoutMs: number,
): Promise<void> {
  if (hasChildExited(child)) return;
  await new Promise<void>((resolve) => {
    const onExit = () => {
      clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = setTimeout(() => {
      child.off("exit", onExit);
      resolve();
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopDetachedRunnerForStartupFailure(
  child: { pid?: number; exitCode: number | null; signalCode: NodeJS.Signals | null; once: (event: "exit", listener: () => void) => void; off: (event: "exit", listener: () => void) => void },
  monitorId: string,
): Promise<void> {
  if (!Number.isInteger(child.pid) || !child.pid || hasChildExited(child)) return;
  try {
    process.kill(child.pid, "SIGTERM");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return;
    throw new Error(`Failed to stop monitor runner ${monitorId} after startup failure: ${describeError(error)}`);
  }

  await waitForChildExit(child, 500);
  if (hasChildExited(child)) return;

  try {
    process.kill(child.pid, "SIGKILL");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") return;
    throw new Error(`Failed to force-stop monitor runner ${monitorId} after startup failure: ${describeError(error)}`);
  }

  await waitForChildExit(child, 500);
}

const MonitorToolSchema = Type.Object({
  action: Type.String({
    description: 'Action to perform: "start", "stop", "list", or "status".',
  }),
  command: Type.Optional(
    Type.String({
      description: "Shell command to run when action is start.",
    }),
  ),
  name: Type.Optional(
    Type.String({
      description: "Optional display name when action is start.",
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description: "Optional working directory when action is start.",
    }),
  ),
  monitorId: Type.Optional(
    Type.String({
      description: "Monitor id required for stop and status.",
    }),
  ),
});

function normalizeAction(raw: unknown): MonitorAction | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "start" || normalized === "stop" || normalized === "list" || normalized === "status") {
    return normalized;
  }
  return null;
}

function tokenizePrefix(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaped) current += "\\";
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function parseMonitorStartArgs(rawArgs: string): ParsedMonitorStartArgs | null {
  const delimiterIndex = rawArgs.indexOf(" -- ");
  if (delimiterIndex < 0) return null;
  const prefix = rawArgs.slice(0, delimiterIndex).trim();
  const command = rawArgs.slice(delimiterIndex + 4).trim();
  if (!command) return null;

  const tokens = tokenizePrefix(prefix);
  if (tokens[0] !== "start") return null;

  let name: string | undefined;
  let cwd: string | undefined;

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--name") {
      name = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith("--name=")) {
      name = token.slice("--name=".length);
      continue;
    }
    if (token === "--cwd") {
      cwd = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token.startsWith("--cwd=")) {
      cwd = token.slice("--cwd=".length);
      continue;
    }
    return null;
  }

  return { command, name, cwd };
}

function formatWakePreview(details: unknown): string {
  if (!details || typeof details !== "object" || !("groups" in details)) {
    return "Monitor updates";
  }
  const data = details as {
    totalEvents?: number;
    monitorCount?: number;
  };
  const monitors = typeof data.monitorCount === "number" ? data.monitorCount : 0;
  const events = typeof data.totalEvents === "number" ? data.totalEvents : 0;
  return `Monitor updates (${events} event${events === 1 ? "" : "s"} across ${monitors} monitor${monitors === 1 ? "" : "s"})`;
}

function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "success" | "warning" | "error" = "info"): void {
  if (ctx.hasUI) {
    ctx.ui.notify(message, level);
    return;
  }
  const prefix = `[monitor]`;
  if (level === "error") {
    console.error(`${prefix} ${message}`);
    return;
  }
  console.log(`${prefix} ${message}`);
}

function refreshMonitorBadge(ctx: ExtensionContext, dirs: ReturnType<typeof createMonitorDirs>): void {
  const session = resolveCurrentSessionIdentity(ctx.sessionManager, ctx.cwd);
  if (!hasOwnerIdentity(session)) {
    ctx.ui.setStatus(MONITOR_STATUS_KEY, undefined);
    return;
  }
  reconcileDeadMonitors(dirs, session);
  const active = filterMonitorStatesForOwner(listMonitorStates(dirs), session, false);
  if (active.length === 0) {
    ctx.ui.setStatus(MONITOR_STATUS_KEY, undefined);
    return;
  }
  const pendingCount = countPendingEventsForOwner(dirs, session);
  const pendingSuffix = pendingCount > 0 ? `, ${pendingCount} pending` : "";
  ctx.ui.setStatus(
    MONITOR_STATUS_KEY,
    `${active.length} monitor${active.length === 1 ? "" : "s"}${pendingSuffix}`,
  );
}

async function maybeDeliverMonitorEvents(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  dirs: ReturnType<typeof createMonitorDirs>,
): Promise<void> {
  const session = resolveCurrentSessionIdentity(ctx.sessionManager, ctx.cwd);
  if (!hasOwnerIdentity(session)) return;
  if (!ctx.isIdle() || ctx.hasPendingMessages()) return;

  const claims = claimPendingEvents(dirs, session);
  if (claims.length === 0) return;

  const statesById = new Map(listMonitorStates(dirs).map((state) => [state.id, state]));
  const payload = buildWakePayload(claims, statesById, MAX_WAKE_LINES_PER_MONITOR);

  try {
    pi.sendMessage(
      {
        customType: MONITOR_EVENT_TYPE,
        content: payload.content,
        display: true,
        details: payload.details,
      },
      { triggerTurn: true, deliverAs: "followUp" },
    );
    moveClaimsToDelivered(dirs, claims);
  } catch (error) {
    restoreClaimsToPending(dirs, claims);
    throw error;
  }
}

async function launchMonitorRunner(
  dirs: ReturnType<typeof createMonitorDirs>,
  monitorId: string,
): Promise<void> {
  const stdout = openSync(path.join(dirs.logsDir, `${monitorId}.runner.log`), "a");
  const stderr = openSync(path.join(dirs.logsDir, `${monitorId}.runner.log`), "a");
  try {
    const child = spawn(process.execPath, [runnerPath, monitorId], {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", stdout, stderr],
      env: process.env,
    });

    const startup = await new Promise<{ ok: true } | { ok: false; message: string }>((resolve) => {
      let settled = false;

      const finish = (result: { ok: true } | { ok: false; message: string }) => {
        if (settled) return;
        settled = true;
        child.removeAllListeners("error");
        child.removeAllListeners("exit");
        resolve(result);
      };

      child.once("error", (error) => {
        finish({ ok: false, message: `Monitor runner failed to start: ${error.message}` });
      });
      child.once("exit", (code, signal) => {
        const suffix =
          typeof code === "number"
            ? `exit code ${code}`
            : signal
              ? `signal ${signal}`
              : "an unknown startup failure";
        finish({ ok: false, message: `Monitor runner exited during startup with ${suffix}.` });
      });

      const deadline = Date.now() + 2_000;
      const poll = () => {
        const state = readMonitorState(dirs, monitorId);
        if (state?.status === "running") {
          finish({ ok: true });
          return;
        }
        if (state && !ACTIVE_MONITOR_STATUSES.has(state.status)) {
          finish({
            ok: false,
            message: state.error
              ? `Monitor runner failed during startup: ${state.error}`
              : `Monitor runner reached ${state.status} during startup.`,
          });
          return;
        }
        if (Date.now() > deadline) {
          finish({
            ok: false,
            message: `Monitor runner did not report running within 2000ms (last status: ${state?.status ?? "missing"}).`,
          });
          return;
        }
        setTimeout(poll, 50);
      };

      poll();
    });

    if (!startup.ok) {
      try {
        await stopDetachedRunnerForStartupFailure(child, monitorId);
      } catch (cleanupError) {
        throw new Error(`${startup.message} ${describeError(cleanupError)}`);
      }
      throw new Error(startup.message);
    }

    child.unref();
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
}

async function handleStart(
  params: { command: string; name?: string; cwd?: string },
  ctx: ExtensionContext,
  dirs: ReturnType<typeof createMonitorDirs>,
) {
  const owner = resolveDurableOwner(process.env, ctx.sessionManager, ctx.cwd);
  if (!hasDurableOwner(owner)) {
    throw new Error("Cannot start monitor without a durable owner session file.");
  }

  const id = generateMonitorId();
  const monitorCwd = resolveMonitorCwd(params.cwd, owner.cwd, ctx.cwd);
  const logPath = createLogPath(dirs, id);
  const state = createInitialMonitorState({
    id,
    owner,
    name: resolveMonitorName(params.name, params.command, id),
    command: params.command,
    cwd: monitorCwd,
    logPath,
  });

  writeMonitorState(dirs, state);
  try {
    await launchMonitorRunner(dirs, id);
  } catch (error) {
    const currentState = readMonitorState(dirs, id) ?? state;
    writeMonitorState(dirs, {
      ...currentState,
      status: "failed",
      updatedAt: new Date().toISOString(),
      endedAt: currentState.endedAt ?? new Date().toISOString(),
      error: currentState.error ?? (error instanceof Error ? error.message : String(error)),
    });
    throw error;
  }

  const started = readMonitorState(dirs, id) ?? state;
  return {
    content: [
      {
        type: "text" as const,
        text: `Started monitor ${started.id} (${started.name}) in ${started.cwd}.`,
      },
    ],
    details: started,
  };
}

function requireMonitorId(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("monitorId is required.");
  }
  return raw.trim();
}

function describeOwner(owner: {
  sessionFile?: string;
  sessionId?: string;
  ownerSessionFile?: string;
  ownerSessionId?: string;
}): string {
  return owner.sessionFile ?? owner.ownerSessionFile ?? owner.sessionId ?? owner.ownerSessionId ?? "<unknown session>";
}

function formatMonitorLookupError(
  monitorId: string,
  owner: { sessionFile?: string; sessionId?: string },
  dirs: ReturnType<typeof createMonitorDirs>,
  state: ReturnType<typeof readMonitorState>,
): string {
  if (!state) {
    return `Monitor ${monitorId} was not found in ${dirs.root}.`;
  }

  return `Monitor ${monitorId} belongs to ${describeOwner(state)}; current owner is ${describeOwner(owner)} (state root: ${dirs.root}).`;
}

function handleStatus(
  monitorId: string,
  ctx: ExtensionContext,
  dirs: ReturnType<typeof createMonitorDirs>,
) {
  const owner = resolveDurableOwner(process.env, ctx.sessionManager, ctx.cwd);
  const state = readMonitorState(dirs, monitorId);
  if (!state || !monitorMatchesOwner(state, owner)) {
    throw new Error(formatMonitorLookupError(monitorId, owner, dirs, state));
  }
  return {
    content: [{ type: "text" as const, text: formatMonitorStatus(state) }],
    details: state,
  };
}

function handleList(
  includeAll: boolean,
  ctx: ExtensionContext,
  dirs: ReturnType<typeof createMonitorDirs>,
) {
  const owner = resolveDurableOwner(process.env, ctx.sessionManager, ctx.cwd);
  const allStates = listMonitorStates(dirs);
  if (includeAll) {
    return {
      content: [{ type: "text" as const, text: formatMonitorList(allStates, true) }],
      details: { monitors: allStates, stateRoot: dirs.root },
    };
  }
  if (!hasOwnerIdentity(owner)) {
    return {
      content: [{ type: "text" as const, text: `Unable to determine current session owner for monitor list in ${dirs.root}.` }],
      details: { monitors: [], stateRoot: dirs.root },
    };
  }

  const states = filterMonitorStatesForOwner(allStates, owner, includeAll);
  if (states.length === 0 && allStates.length > 0) {
    return {
      content: [{ type: "text" as const, text: `No ${includeAll ? "" : "active "}monitors for ${describeOwner(owner)} in ${dirs.root}.` }],
      details: { monitors: [], stateRoot: dirs.root, owner: describeOwner(owner) },
    };
  }
  return {
    content: [{ type: "text" as const, text: formatMonitorList(states, includeAll) }],
    details: { monitors: states },
  };
}

function handleStop(
  monitorId: string,
  ctx: ExtensionContext,
  dirs: ReturnType<typeof createMonitorDirs>,
) {
  const owner = resolveDurableOwner(process.env, ctx.sessionManager, ctx.cwd);
  reconcileDeadMonitors(dirs, owner);
  const state = readMonitorState(dirs, monitorId);
  if (!state || !monitorMatchesOwner(state, owner)) {
    throw new Error(formatMonitorLookupError(monitorId, owner, dirs, state));
  }

  if (!ACTIVE_MONITOR_STATUSES.has(state.status)) {
    return {
      content: [{ type: "text" as const, text: `Monitor ${monitorId} is already ${state.status}.` }],
      details: state,
    };
  }

  const stoppingState = {
    ...state,
    status: "stopping",
    stopRequestedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  writeMonitorState(dirs, stoppingState);

  if (typeof stoppingState.pid === "number" && isProcessAlive(stoppingState.pid)) {
    try {
      process.kill(stoppingState.pid, "SIGTERM");
    } catch (error) {
      writeMonitorState(dirs, {
        ...stoppingState,
        status: "stopping",
        error: error instanceof Error ? `Failed to signal monitor process: ${error.message}` : `Failed to signal monitor process: ${String(error)}`,
      });
      throw new Error(
        error instanceof Error
          ? `Failed to stop monitor ${monitorId}: ${error.message}`
          : `Failed to stop monitor ${monitorId}: ${String(error)}`,
      );
    }
  } else {
    const currentState = readMonitorState(dirs, monitorId) ?? stoppingState;
    const resolvedStatus =
      currentState.exitCode === 0
        ? "exited"
        : currentState.stopRequestedAt && currentState.status === "stopped"
          ? "stopped"
          : "failed";
    writeMonitorState(dirs, {
      ...currentState,
      status: resolvedStatus,
      endedAt: currentState.endedAt ?? new Date().toISOString(),
      error:
        resolvedStatus === "failed"
          ? currentState.error ?? "Monitor runner is no longer alive."
          : currentState.error,
    });
    return {
      content: [{ type: "text" as const, text: `Monitor ${monitorId} was already ${resolvedStatus}.` }],
      details: readMonitorState(dirs, monitorId) ?? currentState,
    };
  }

  return {
    content: [{ type: "text" as const, text: `Stop requested for monitor ${monitorId}.` }],
    details: readMonitorState(dirs, monitorId) ?? stoppingState,
  };
}

async function runMonitorAction(
  action: MonitorAction,
  params: MonitorToolParams,
  ctx: ExtensionContext,
  dirs: ReturnType<typeof createMonitorDirs>,
) {
  switch (action) {
    case "start":
      if (typeof params.command !== "string" || params.command.trim().length === 0) {
        throw new Error("command is required when action is start.");
      }
      return handleStart(
        { command: params.command.trim(), name: params.name, cwd: params.cwd },
        ctx,
        dirs,
      );
    case "status":
      return handleStatus(requireMonitorId(params.monitorId), ctx, dirs);
    case "stop":
      return handleStop(requireMonitorId(params.monitorId), ctx, dirs);
    case "list":
      return handleList(false, ctx, dirs);
  }
}

export default function monitorExtension(pi: ExtensionAPI): void {
  const dirs = ensureMonitorDirs(createMonitorDirs(resolveMonitorStateRoot()));
  let pollTimer: NodeJS.Timeout | undefined;
  let statusTimer: NodeJS.Timeout | undefined;

  const clearTimers = (ctx?: ExtensionContext) => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = undefined;
    }
    ctx?.ui.setStatus(MONITOR_STATUS_KEY, undefined);
  };

  const startTimers = (ctx: ExtensionContext) => {
    clearTimers(ctx);
    requeueStaleProcessingEvents(dirs);
    const session = resolveCurrentSessionIdentity(ctx.sessionManager, ctx.cwd);
    if (session.sessionId) {
      reconcileDeadMonitors(dirs, session.sessionId);
    }
    refreshMonitorBadge(ctx, dirs);

    pollTimer = setInterval(() => {
      void maybeDeliverMonitorEvents(pi, ctx, dirs).catch((error) => {
        console.error("[monitor] failed to deliver monitor events", error);
      });
    }, EVENT_POLL_INTERVAL_MS);
    pollTimer.unref?.();

    statusTimer = setInterval(() => {
      try {
        refreshMonitorBadge(ctx, dirs);
      } catch (error) {
        console.error("[monitor] failed to refresh monitor status", error);
      }
    }, STATUS_REFRESH_INTERVAL_MS);
    statusTimer.unref?.();
  };

  pi.registerMessageRenderer(MONITOR_EVENT_TYPE, (message, { expanded }, theme) => {
    const heading = theme.fg("accent", formatWakePreview(message.details));
    const body = typeof message.content === "string" ? message.content : "Monitor updates";
    const rendered = expanded ? `${heading}\n${body}` : `${heading}\n${theme.fg("dim", "Expand for details")}`;
    const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
    box.addChild(new Text(rendered, 0, 0));
    return box;
  });

  pi.registerTool({
    name: "monitor",
    label: "Monitor",
    description: "Start, stop, list, or inspect detached shell monitors that wake the owning session when they emit stdout lines.",
    promptSnippet: "Use `monitor` to manage detached shell monitors that emit wake-up events to the owning session.",
    parameters: MonitorToolSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = normalizeAction(params.action);
      if (!action) {
        throw new Error('action must be one of: "start", "stop", "list", "status".');
      }
      return runMonitorAction(action, params, ctx, dirs);
    },
  });

  pi.registerCommand("monitor", {
    description: "Manage detached shell monitors.",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed) {
        const result = handleList(false, ctx, dirs);
        notify(ctx, result.content[0].text);
        return;
      }

      if (trimmed === "list" || trimmed === "list --all") {
        const result = handleList(trimmed.includes("--all"), ctx, dirs);
        notify(ctx, result.content[0].text);
        return;
      }

      if (trimmed.startsWith("status ")) {
        const result = handleStatus(trimmed.slice("status ".length).trim(), ctx, dirs);
        notify(ctx, result.content[0].text);
        return;
      }

      if (trimmed.startsWith("stop ")) {
        const result = handleStop(trimmed.slice("stop ".length).trim(), ctx, dirs);
        notify(ctx, result.content[0].text, "warning");
        return;
      }

      if (trimmed.startsWith("start")) {
        const parsed = parseMonitorStartArgs(trimmed);
        if (!parsed) {
          notify(ctx, "Usage: /monitor start [--name <name>] [--cwd <cwd>] -- <command>", "error");
          return;
        }
        const result = await handleStart(parsed, ctx, dirs);
        notify(ctx, result.content[0].text, "success");
        return;
      }

      notify(ctx, "Usage: /monitor [list|list --all|status <id>|stop <id>|start [--name <name>] [--cwd <cwd>] -- <command>]", "error");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    startTimers(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    clearTimers(ctx);
  });
}
