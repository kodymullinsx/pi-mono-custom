import fs from "node:fs";
import { spawn } from "node:child_process";

import {
  STOP_GRACE_MS,
  createMonitorDirs,
  createMonitorEvent,
  enqueueMonitorEvent,
  readMonitorState,
  resolveMonitorStateRoot,
  writeMonitorState,
} from "./core.js";

const monitorId = process.argv[2];
if (!monitorId) {
  console.error("[monitor] missing monitor id");
  process.exit(1);
}

const dirs = createMonitorDirs(resolveMonitorStateRoot());
const state = readMonitorState(dirs, monitorId);
if (!state) {
  console.error(`[monitor] monitor ${monitorId} not found`);
  process.exit(1);
}

let shellChild = null;
let stopRequested = false;
let stdoutBuffer = "";
let stderrBuffer = "";
let lastStderrLine = "";
const logStream = fs.createWriteStream(state.logPath, { flags: "a" });

function appendLog(chunk) {
  if (!chunk) return;
  logStream.write(chunk);
}

function updateState(patch) {
  const current = readMonitorState(dirs, monitorId) ?? state;
  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeMonitorState(dirs, next);
  return next;
}

function emitLine(line) {
  if (typeof line !== "string" || line.trim().length === 0) return;
  const current = readMonitorState(dirs, monitorId) ?? state;
  enqueueMonitorEvent(
    dirs,
    createMonitorEvent({
      monitorId,
      ownerSessionId: current.ownerSessionId,
      ownerSessionFile: current.ownerSessionFile,
      kind: "line",
      line,
    }),
  );
  updateState({
    eventCount: (current.eventCount ?? 0) + 1,
    lastEventAt: new Date().toISOString(),
    lastEventLine: line,
  });
}

function flushStdoutBuffer(force = false) {
  let newlineIndex = stdoutBuffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, "");
    emitLine(line);
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    newlineIndex = stdoutBuffer.indexOf("\n");
  }
  if (force && stdoutBuffer.length > 0) {
    emitLine(stdoutBuffer.replace(/\r$/, ""));
    stdoutBuffer = "";
  }
}

function flushStderrBuffer(force = false) {
  let newlineIndex = stderrBuffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = stderrBuffer.slice(0, newlineIndex).replace(/\r$/, "").trim();
    if (line.length > 0) {
      lastStderrLine = line;
    }
    stderrBuffer = stderrBuffer.slice(newlineIndex + 1);
    newlineIndex = stderrBuffer.indexOf("\n");
  }
  if (force && stderrBuffer.length > 0) {
    const line = stderrBuffer.replace(/\r$/, "").trim();
    if (line.length > 0) {
      lastStderrLine = line;
    }
    stderrBuffer = "";
  }
  return lastStderrLine;
}

function finalize(exitCode, errorMessage) {
  flushStdoutBuffer(true);
  const stderrLine = flushStderrBuffer(true);
  const now = new Date().toISOString();
  const current = readMonitorState(dirs, monitorId) ?? state;
  const nextStatus =
    stopRequested || current.stopRequestedAt
      ? "stopped"
      : exitCode === 0
      ? "exited"
      : "failed";
  let nextError = errorMessage ?? (nextStatus === "failed" ? `Monitor exited with code ${exitCode ?? "unknown"}.` : undefined);
  if (nextStatus === "failed" && stderrLine && (!nextError || !nextError.includes(stderrLine))) {
    nextError = nextError ? `${nextError} stderr: ${stderrLine}` : `stderr: ${stderrLine}`;
  }
  const nextState = updateState({
    status: nextStatus,
    exitCode,
    endedAt: now,
    startedAt: current.startedAt ?? now,
    error: nextError,
  });

  if (nextStatus === "failed" && !stopRequested) {
    enqueueMonitorEvent(
      dirs,
      createMonitorEvent({
        monitorId,
        ownerSessionId: nextState.ownerSessionId,
        ownerSessionFile: nextState.ownerSessionFile,
        kind: "error",
        line: nextError,
        exitCode,
      }),
    );
  }

  logStream.end();
}

process.on("SIGTERM", () => {
  stopRequested = true;
  updateState({
    status: "stopping",
    stopRequestedAt: new Date().toISOString(),
  });

  if (!shellChild || shellChild.killed) {
    finalize(0, undefined);
    process.exit(0);
    return;
  }

  try {
    shellChild.kill("SIGTERM");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[monitor] failed to stop shell child for ${monitorId}: ${message}`);
    updateState({
      status: "failed",
      endedAt: new Date().toISOString(),
      error: `Failed to stop shell child: ${message}`,
    });
    logStream.end();
    process.exit(1);
    return;
  }
  setTimeout(() => {
    if (shellChild && !shellChild.killed) {
      try {
        shellChild.kill("SIGKILL");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[monitor] failed to force-stop shell child for ${monitorId}: ${message}`);
        updateState({
          error: `Failed to force-stop shell child: ${message}`,
        });
      }
    }
  }, STOP_GRACE_MS).unref?.();
});

process.on("SIGINT", () => {
  process.emit("SIGTERM");
});

shellChild = spawn(state.command, {
  cwd: state.cwd,
  shell: true,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

updateState({
  pid: process.pid,
  status: "running",
  startedAt: new Date().toISOString(),
  error: undefined,
});

shellChild.stdout?.on("data", (chunk) => {
  const text = chunk.toString("utf8");
  appendLog(text);
  stdoutBuffer += text;
  flushStdoutBuffer(false);
});

shellChild.stderr?.on("data", (chunk) => {
  const text = chunk.toString("utf8");
  appendLog(text);
  stderrBuffer += text;
  flushStderrBuffer(false);
});

shellChild.once("error", (error) => {
  finalize(1, `Monitor failed to start: ${error.message}`);
  process.exit(1);
});

shellChild.once("exit", (code, signal) => {
  const exitCode = stopRequested ? 0 : typeof code === "number" ? code : signal ? 1 : 0;
  const errorMessage =
    !stopRequested && signal
      ? `Monitor terminated by signal ${signal}.`
      : undefined;
  finalize(exitCode, errorMessage);
  process.exit(exitCode ?? 0);
});
