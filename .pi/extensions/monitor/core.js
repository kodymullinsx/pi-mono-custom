import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const MONITOR_EVENT_TYPE = "monitor-event";
export const MONITOR_STATUS_KEY = "monitor";
export const MONITOR_OWNER_SESSION_ID_ENV = "PI_MONITOR_OWNER_SESSION_ID";
export const MONITOR_OWNER_SESSION_FILE_ENV = "PI_MONITOR_OWNER_SESSION_FILE";
export const MONITOR_OWNER_CWD_ENV = "PI_MONITOR_OWNER_CWD";
export const MONITOR_STATE_ROOT_ENV = "PI_MONITOR_STATE_ROOT";
export const EVENT_REQUEUE_AGE_MS = 60_000;
export const EVENT_POLL_INTERVAL_MS = 2_000;
export const STATUS_REFRESH_INTERVAL_MS = 5_000;
export const STOP_GRACE_MS = 5_000;
export const MAX_WAKE_LINES_PER_MONITOR = 20;
export const ACTIVE_MONITOR_STATUSES = new Set(["starting", "running", "stopping"]);

function normalizeNonEmptyString(raw) {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function logMonitorWarning(message, error) {
  const formatted = `[monitor] ${message}`;
  if (error === undefined) {
    console.warn(formatted);
    return;
  }
  console.warn(formatted, error);
}

function describeError(error) {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function resolveOptionalPath(rawPath) {
  const normalized = normalizeNonEmptyString(rawPath);
  if (!normalized) return undefined;
  if (normalized === "~") return os.homedir();
  if (normalized.startsWith("~/")) return path.join(os.homedir(), normalized.slice(2));
  return path.resolve(normalized);
}

function resolveAgentDir(env = process.env) {
  const preferredKeys = ["PI_CODING_AGENT_DIR", "TAU_CODING_AGENT_DIR"];
  for (const key of preferredKeys) {
    const candidate = resolveOptionalPath(env?.[key]);
    if (candidate) return candidate;
  }
  for (const [key, value] of Object.entries(env ?? {})) {
    if (!key.endsWith("_CODING_AGENT_DIR")) continue;
    const candidate = resolveOptionalPath(value);
    if (candidate) return candidate;
  }
  return undefined;
}

function normalizeOwnerIdentity(rawOwner) {
  if (typeof rawOwner === "string") {
    return { sessionId: normalizeNonEmptyString(rawOwner), sessionFile: undefined };
  }
  if (!rawOwner || typeof rawOwner !== "object") {
    return { sessionId: undefined, sessionFile: undefined };
  }
  return {
    sessionId: normalizeNonEmptyString(rawOwner.sessionId),
    sessionFile: resolveOptionalPath(rawOwner.sessionFile),
  };
}

export function hasOwnerIdentity(owner) {
  const normalizedOwner = normalizeOwnerIdentity(owner);
  return Boolean(normalizedOwner.sessionFile || normalizedOwner.sessionId);
}

export function monitorMatchesOwner(record, owner) {
  const normalizedOwner = normalizeOwnerIdentity(owner);
  if (!normalizedOwner.sessionFile && !normalizedOwner.sessionId) return false;

  const recordSessionFile = resolveOptionalPath(record?.ownerSessionFile);
  if (normalizedOwner.sessionFile && recordSessionFile) {
    return normalizedOwner.sessionFile === recordSessionFile;
  }

  const recordSessionId = normalizeNonEmptyString(record?.ownerSessionId);
  if (normalizedOwner.sessionId && recordSessionId) {
    return normalizedOwner.sessionId === recordSessionId;
  }

  return false;
}

export function createMonitorDirs(root = resolveMonitorStateRoot()) {
  return {
    root,
    monitorsDir: path.join(root, "monitors"),
    pendingDir: path.join(root, "events", "pending"),
    processingDir: path.join(root, "events", "processing"),
    deliveredDir: path.join(root, "events", "delivered"),
    logsDir: path.join(root, "logs"),
  };
}

export function resolveMonitorStateRoot(env = process.env) {
  const explicitRoot = resolveOptionalPath(env?.[MONITOR_STATE_ROOT_ENV]);
  if (explicitRoot) return explicitRoot;

  const agentDir = resolveAgentDir(env);
  if (agentDir) return path.join(agentDir, "state", "monitor");

  return path.join(os.homedir(), ".pi", "agent", "state", "monitor");
}

export function ensureMonitorDirs(dirs) {
  for (const dirPath of [
    dirs.root,
    dirs.monitorsDir,
    dirs.pendingDir,
    dirs.processingDir,
    dirs.deliveredDir,
    dirs.logsDir,
  ]) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirs;
}

export function generateMonitorId() {
  return crypto.randomBytes(4).toString("hex");
}

export function resolveDurableOwner(env, sessionManager, fallbackCwd) {
  const inherited = {
    sessionId: normalizeNonEmptyString(env?.[MONITOR_OWNER_SESSION_ID_ENV]),
    sessionFile: resolveOptionalPath(env?.[MONITOR_OWNER_SESSION_FILE_ENV]),
    cwd: normalizeNonEmptyString(env?.[MONITOR_OWNER_CWD_ENV]),
  };
  if (inherited.sessionId || inherited.sessionFile || inherited.cwd) {
    return {
      sessionId: inherited.sessionId,
      sessionFile: inherited.sessionFile,
      cwd: inherited.cwd ?? normalizeNonEmptyString(fallbackCwd),
    };
  }

  const sessionId =
    typeof sessionManager?.getSessionId === "function"
      ? normalizeNonEmptyString(sessionManager.getSessionId())
      : undefined;
  const sessionFile =
    typeof sessionManager?.getSessionFile === "function"
      ? resolveOptionalPath(sessionManager.getSessionFile())
      : undefined;
  return {
    sessionId,
    sessionFile,
    cwd: normalizeNonEmptyString(
      typeof sessionManager?.getCwd === "function" ? sessionManager.getCwd() : fallbackCwd,
    ),
  };
}

export function resolveCurrentSessionIdentity(sessionManager, fallbackCwd) {
  return {
    sessionId:
      typeof sessionManager?.getSessionId === "function"
        ? normalizeNonEmptyString(sessionManager.getSessionId())
        : undefined,
    sessionFile:
      typeof sessionManager?.getSessionFile === "function"
        ? resolveOptionalPath(sessionManager.getSessionFile())
        : undefined,
    cwd: normalizeNonEmptyString(
      typeof sessionManager?.getCwd === "function" ? sessionManager.getCwd() : fallbackCwd,
    ),
  };
}

export function hasDurableOwner(owner) {
  return Boolean(owner?.sessionId && owner?.sessionFile);
}

export function resolveMonitorCwd(requestedCwd, ownerCwd, fallbackCwd) {
  return normalizeNonEmptyString(requestedCwd) ?? normalizeNonEmptyString(ownerCwd) ?? normalizeNonEmptyString(fallbackCwd) ?? process.cwd();
}

export function resolveMonitorName(requestedName, command, id) {
  const preferred = normalizeNonEmptyString(requestedName);
  if (preferred) return preferred;
  const commandText = normalizeNonEmptyString(command);
  if (!commandText) return `monitor-${id}`;
  return commandText.length > 48 ? `${commandText.slice(0, 45)}...` : commandText;
}

function monitorStatePath(dirs, monitorId) {
  return path.join(dirs.monitorsDir, `${monitorId}.json`);
}

export function createLogPath(dirs, monitorId) {
  return path.join(dirs.logsDir, `${monitorId}.log`);
}

export function createInitialMonitorState({ id, owner, name, command, cwd, logPath }) {
  const now = new Date().toISOString();
  return {
    id,
    ownerSessionId: owner.sessionId,
    ownerSessionFile: owner.sessionFile,
    ownerCwd: owner.cwd,
    name,
    command,
    cwd,
    pid: undefined,
    status: "starting",
    createdAt: now,
    startedAt: undefined,
    updatedAt: now,
    endedAt: undefined,
    lastEventAt: undefined,
    lastEventLine: undefined,
    eventCount: 0,
    logPath,
    exitCode: undefined,
    error: undefined,
    stopRequestedAt: undefined,
  };
}

export function probeProcessLiveness(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return { alive: false, error: undefined };
  try {
    process.kill(pid, 0);
    return { alive: true, error: undefined };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") {
      return { alive: false, error: undefined };
    }
    const message = `failed to check liveness for pid ${pid}; treating it as not alive`;
    logMonitorWarning(message, error);
    return { alive: false, error: `${message}: ${describeError(error)}` };
  }
}

export function isProcessAlive(pid) {
  return probeProcessLiveness(pid).alive;
}

export function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

export function writeJsonFileAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function writeMonitorState(dirs, state) {
  writeJsonFileAtomic(monitorStatePath(dirs, state.id), state);
  return state;
}

export function readMonitorState(dirs, monitorId) {
  const filePath = monitorStatePath(dirs, monitorId);
  if (!fs.existsSync(filePath)) return null;
  return readJsonFile(filePath);
}

export function listMonitorStates(dirs) {
  if (!fs.existsSync(dirs.monitorsDir)) return [];
  const files = fs
    .readdirSync(dirs.monitorsDir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  return files.map((name) => readJsonFile(path.join(dirs.monitorsDir, name)));
}

export function filterMonitorStatesForOwner(states, owner, includeAll = false) {
  return states
    .filter((state) => monitorMatchesOwner(state, owner))
    .filter((state) => includeAll || ACTIVE_MONITOR_STATUSES.has(state.status))
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

export function countPendingEventsForOwner(dirs, owner) {
  if (!fs.existsSync(dirs.pendingDir)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(dirs.pendingDir)) {
    if (!entry.endsWith(".json")) continue;
    try {
      const event = readJsonFile(path.join(dirs.pendingDir, entry));
      if (monitorMatchesOwner(event, owner)) count += 1;
    } catch (error) {
      logMonitorWarning(`failed to inspect pending monitor event ${path.join(dirs.pendingDir, entry)}`, error);
    }
  }
  return count;
}

export function createMonitorEvent({ monitorId, ownerSessionId, ownerSessionFile, kind, line, exitCode }) {
  return {
    eventId: `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    monitorId,
    ownerSessionId,
    ownerSessionFile: resolveOptionalPath(ownerSessionFile),
    createdAt: new Date().toISOString(),
    kind,
    line,
    exitCode,
  };
}

export function enqueueMonitorEvent(dirs, event) {
  ensureMonitorDirs(dirs);
  const filePath = path.join(dirs.pendingDir, `${event.createdAt.replace(/[:.]/g, "-")}-${event.eventId}.json`);
  writeJsonFileAtomic(filePath, event);
  return filePath;
}

export function claimPendingEvents(dirs, owner) {
  if (!hasOwnerIdentity(owner) || !fs.existsSync(dirs.pendingDir)) {
    return [];
  }

  const claims = [];
  for (const entry of fs.readdirSync(dirs.pendingDir).sort()) {
    if (!entry.endsWith(".json")) continue;
    const pendingPath = path.join(dirs.pendingDir, entry);
    let event;
    try {
      event = readJsonFile(pendingPath);
    } catch (error) {
      logMonitorWarning(`failed to read pending monitor event ${pendingPath}`, error);
      continue;
    }
    if (!monitorMatchesOwner(event, owner)) continue;
    const processingPath = path.join(dirs.processingDir, entry);
    try {
      fs.renameSync(pendingPath, processingPath);
      claims.push({ event, processingPath });
    } catch (error) {
      if (!fs.existsSync(pendingPath)) {
        continue;
      }
      logMonitorWarning(`failed to claim pending monitor event ${pendingPath}`, error);
    }
  }
  return claims;
}

export function moveClaimsToDelivered(dirs, claims) {
  for (const claim of claims) {
    const targetPath = path.join(dirs.deliveredDir, path.basename(claim.processingPath));
    fs.renameSync(claim.processingPath, targetPath);
  }
}

export function restoreClaimsToPending(dirs, claims) {
  for (const claim of claims) {
    const targetPath = path.join(dirs.pendingDir, path.basename(claim.processingPath));
    if (fs.existsSync(claim.processingPath)) {
      try {
        fs.renameSync(claim.processingPath, targetPath);
      } catch (error) {
        logMonitorWarning(`failed to restore claimed monitor event ${claim.processingPath} to pending`, error);
      }
    }
  }
}

export function requeueStaleProcessingEvents(dirs, staleAgeMs = EVENT_REQUEUE_AGE_MS) {
  if (!fs.existsSync(dirs.processingDir)) return 0;
  const now = Date.now();
  let moved = 0;
  for (const entry of fs.readdirSync(dirs.processingDir)) {
    if (!entry.endsWith(".json")) continue;
    const processingPath = path.join(dirs.processingDir, entry);
    const stats = fs.statSync(processingPath);
    if (now - stats.mtimeMs < staleAgeMs) continue;
    const pendingPath = path.join(dirs.pendingDir, entry);
    fs.renameSync(processingPath, pendingPath);
    moved += 1;
  }
  return moved;
}

export function reconcileDeadMonitors(dirs, owner) {
  let updated = 0;
  for (const state of listMonitorStates(dirs)) {
    if (hasOwnerIdentity(owner) && !monitorMatchesOwner(state, owner)) continue;
    if (!ACTIVE_MONITOR_STATUSES.has(state.status)) continue;
    const liveness = probeProcessLiveness(state.pid);
    if (liveness.alive) continue;

    const now = new Date().toISOString();
    let nextStatus = state.status;
    if (state.stopRequestedAt) {
      nextStatus = "stopped";
    } else if (state.exitCode === 0) {
      nextStatus = "exited";
    } else {
      nextStatus = "failed";
    }

    writeMonitorState(dirs, {
      ...state,
      status: nextStatus,
      updatedAt: now,
      endedAt: state.endedAt ?? now,
      error: state.error ?? (nextStatus === "failed" ? liveness.error ?? "Monitor runner is no longer alive." : undefined),
    });
    updated += 1;
  }
  return updated;
}

export function buildWakePayload(claims, statesById, maxLinesPerMonitor = MAX_WAKE_LINES_PER_MONITOR) {
  const grouped = new Map();
  for (const { event } of claims) {
    const existing =
      grouped.get(event.monitorId) ??
      {
        monitorId: event.monitorId,
        monitorName: statesById.get(event.monitorId)?.name ?? event.monitorId,
        lines: [],
        totalLines: 0,
        hasError: false,
        exitCode: undefined,
      };
    if (typeof event.line === "string" && event.line.trim().length > 0) {
      existing.totalLines += 1;
      if (existing.lines.length < maxLinesPerMonitor) {
        existing.lines.push(event.line);
      }
    }
    if (event.kind === "error") {
      existing.hasError = true;
      existing.exitCode = event.exitCode;
    }
    grouped.set(event.monitorId, existing);
  }

  const groups = Array.from(grouped.values());
  const lines = [];
  for (const group of groups) {
    const headerSuffix =
      group.hasError && typeof group.exitCode === "number"
        ? ` (failed: exit ${group.exitCode})`
        : group.hasError
          ? " (failed)"
          : "";
    lines.push(`${group.monitorName} [${group.monitorId}]${headerSuffix}`);
    for (const line of group.lines) {
      lines.push(`- ${line}`);
    }
    if (group.totalLines > group.lines.length) {
      lines.push(`- +${group.totalLines - group.lines.length} more`);
    }
  }

  const details = {
    totalEvents: claims.length,
    monitorCount: groups.length,
    groups: groups.map((group) => ({
      monitorId: group.monitorId,
      monitorName: group.monitorName,
      lines: group.lines,
      totalLines: group.totalLines,
      hiddenLines: Math.max(0, group.totalLines - group.lines.length),
      hasError: group.hasError,
      exitCode: group.exitCode,
    })),
  };

  return {
    content: `Monitor updates:\n${lines.join("\n")}`,
    details,
  };
}

export function formatMonitorLine(state) {
  const ended = state.endedAt ? `, ended ${state.endedAt}` : "";
  const exit = typeof state.exitCode === "number" ? `, exit ${state.exitCode}` : "";
  return `${state.id}  ${state.name}  [${state.status}]  cwd=${state.cwd}${exit}${ended}`;
}

export function formatMonitorList(states, includeAll = false) {
  if (states.length === 0) {
    return includeAll ? "No monitors found." : "No active monitors.";
  }
  return states.map((state) => formatMonitorLine(state)).join("\n");
}

export function formatMonitorStatus(state) {
  const lines = [
    `id: ${state.id}`,
    `name: ${state.name}`,
    `status: ${state.status}`,
    `command: ${state.command}`,
    `cwd: ${state.cwd}`,
    `owner session: ${state.ownerSessionId}`,
    `log: ${state.logPath}`,
    `events: ${state.eventCount}`,
    `updated: ${state.updatedAt}`,
  ];
  if (typeof state.pid === "number") lines.push(`pid: ${state.pid}`);
  if (typeof state.exitCode === "number") lines.push(`exit code: ${state.exitCode}`);
  if (state.lastEventAt) lines.push(`last event at: ${state.lastEventAt}`);
  if (state.lastEventLine) lines.push(`last line: ${state.lastEventLine}`);
  if (state.error) lines.push(`error: ${state.error}`);
  return lines.join("\n");
}
