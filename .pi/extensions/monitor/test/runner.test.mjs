import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import {
  MONITOR_STATE_ROOT_ENV,
  createInitialMonitorState,
  createLogPath,
  createMonitorDirs,
  ensureMonitorDirs,
  listMonitorStates,
  readJsonFile,
  readMonitorState,
  writeMonitorState,
} from "../core.js";

const runnerPath = new URL("../runner.mjs", import.meta.url);

function makeTempDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-runner-"));
  return ensureMonitorDirs(createMonitorDirs(root));
}

function cleanupDirs(dirs) {
  fs.rmSync(dirs.root, { recursive: true, force: true });
}

function createOwner() {
  return {
    sessionId: "root-session",
    sessionFile: "/tmp/root-session.jsonl",
    cwd: "/workspace/root",
  };
}

function readPendingEvents(dirs) {
  if (!fs.existsSync(dirs.pendingDir)) return [];
  return fs
    .readdirSync(dirs.pendingDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .map((entry) => readJsonFile(path.join(dirs.pendingDir, entry)));
}

async function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out after ${timeoutMs}ms`);
}

function createState(dirs, id, command) {
  const state = createInitialMonitorState({
    id,
    owner: createOwner(),
    name: id,
    command,
    cwd: dirs.root,
    logPath: createLogPath(dirs, id),
  });
  writeMonitorState(dirs, state);
  return state;
}

test("runner ignores blank stdout lines, logs stderr, and exits cleanly without an error wake", async () => {
  const dirs = makeTempDirs();
  try {
    createState(
      dirs,
      "clean-monitor",
      `${process.execPath} -e ${JSON.stringify("console.log('alpha'); console.log(''); console.error('stderr only');")}`,
    );

    const child = spawn(process.execPath, [runnerPath.pathname, "clean-monitor"], {
      env: {
        ...process.env,
        [MONITOR_STATE_ROOT_ENV]: dirs.root,
      },
      stdio: ["ignore", "ignore", "ignore"],
    });

    const exit = await waitForExit(child);
    assert.equal(exit.code, 0);

    const finalState = readMonitorState(dirs, "clean-monitor");
    assert.equal(finalState.status, "exited");
    assert.equal(finalState.exitCode, 0);
    assert.equal(finalState.eventCount, 1);
    assert.equal(finalState.lastEventLine, "alpha");

    const events = readPendingEvents(dirs);
    assert.equal(events.length, 1);
    assert.equal(events[0].kind, "line");
    assert.equal(events[0].line, "alpha");

    const log = fs.readFileSync(finalState.logPath, "utf8");
    assert.match(log, /alpha/);
    assert.match(log, /stderr only/);
  } finally {
    cleanupDirs(dirs);
  }
});

test("runner emits a terminal error event on non-zero exit", async () => {
  const dirs = makeTempDirs();
  try {
    createState(
      dirs,
      "failing-monitor",
      `${process.execPath} -e ${JSON.stringify("console.log('before fail'); process.exit(3);")}`,
    );

    const child = spawn(process.execPath, [runnerPath.pathname, "failing-monitor"], {
      env: {
        ...process.env,
        [MONITOR_STATE_ROOT_ENV]: dirs.root,
      },
      stdio: ["ignore", "ignore", "ignore"],
    });

    const exit = await waitForExit(child);
    assert.equal(exit.code, 3);

    const finalState = readMonitorState(dirs, "failing-monitor");
    assert.equal(finalState.status, "failed");
    assert.equal(finalState.exitCode, 3);

    const events = readPendingEvents(dirs);
    assert.equal(events.length, 2);
    assert.equal(events[0].kind, "line");
    assert.equal(events[1].kind, "error");
    assert.equal(events[1].exitCode, 3);
    assert.match(events[1].line, /code 3/i);
  } finally {
    cleanupDirs(dirs);
  }
});

test("runner treats SIGTERM as a manual stop and does not emit an error wake", async () => {
  const dirs = makeTempDirs();
  try {
    createState(
      dirs,
      "stopping-monitor",
      `${process.execPath} -e ${JSON.stringify("setInterval(() => {}, 1000);")}`,
    );

    const child = spawn(process.execPath, [runnerPath.pathname, "stopping-monitor"], {
      env: {
        ...process.env,
        [MONITOR_STATE_ROOT_ENV]: dirs.root,
      },
      stdio: ["ignore", "ignore", "ignore"],
    });

    await waitFor(() => {
      const state = readMonitorState(dirs, "stopping-monitor");
      return state?.status === "running" && typeof state.pid === "number";
    });

    child.kill("SIGTERM");
    const exit = await waitForExit(child);
    assert.equal(exit.code, 0);

    const finalState = readMonitorState(dirs, "stopping-monitor");
    assert.equal(finalState.status, "stopped");

    const events = readPendingEvents(dirs);
    assert.equal(events.filter((event) => event.kind === "error").length, 0);
  } finally {
    cleanupDirs(dirs);
  }
});
