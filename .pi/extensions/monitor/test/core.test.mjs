import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildWakePayload,
  claimPendingEvents,
  createInitialMonitorState,
  createLogPath,
  createMonitorDirs,
  createMonitorEvent,
  enqueueMonitorEvent,
  ensureMonitorDirs,
  filterMonitorStatesForOwner,
  formatMonitorList,
  hasDurableOwner,
  hasOwnerIdentity,
  isProcessAlive,
  listMonitorStates,
  monitorMatchesOwner,
  probeProcessLiveness,
  readMonitorState,
  reconcileDeadMonitors,
  requeueStaleProcessingEvents,
  resolveCurrentSessionIdentity,
  resolveDurableOwner,
  resolveMonitorCwd,
  resolveMonitorName,
  resolveMonitorStateRoot,
  writeMonitorState,
} from "../core.js";

function makeTempDirs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-core-"));
  return ensureMonitorDirs(createMonitorDirs(root));
}

function cleanupDirs(dirs) {
  fs.rmSync(dirs.root, { recursive: true, force: true });
}

function createOwner(sessionId = "root-session") {
  return {
    sessionId,
    sessionFile: `/tmp/${sessionId}.jsonl`,
    cwd: "/workspace/root",
  };
}

test("resolveDurableOwner prefers propagated env while current session identity ignores it", () => {
  const sessionManager = {
    getSessionId: () => "child-session",
    getSessionFile: () => "/tmp/child.jsonl",
    getCwd: () => "/workspace/child",
  };

  const owner = resolveDurableOwner(
    {
      PI_MONITOR_OWNER_SESSION_ID: "root-session",
      PI_MONITOR_OWNER_SESSION_FILE: "/tmp/root.jsonl",
      PI_MONITOR_OWNER_CWD: "/workspace/root",
    },
    sessionManager,
    "/workspace/fallback",
  );
  assert.deepEqual(owner, {
    sessionId: "root-session",
    sessionFile: "/tmp/root.jsonl",
    cwd: "/workspace/root",
  });
  assert.equal(hasDurableOwner(owner), true);

  const current = resolveCurrentSessionIdentity(sessionManager, "/workspace/fallback");
  assert.deepEqual(current, {
    sessionId: "child-session",
    sessionFile: "/tmp/child.jsonl",
    cwd: "/workspace/child",
  });
});

test("resolveMonitorCwd and resolveMonitorName apply expected fallback order", () => {
  assert.equal(resolveMonitorCwd("/tmp/work", "/root", "/fallback"), "/tmp/work");
  assert.equal(resolveMonitorCwd(undefined, "/root", "/fallback"), "/root");
  assert.equal(resolveMonitorCwd(undefined, undefined, "/fallback"), "/fallback");

  assert.equal(resolveMonitorName("named monitor", "echo hi", "abc123"), "named monitor");
  assert.equal(resolveMonitorName(undefined, "echo hi", "abc123"), "echo hi");
  assert.equal(resolveMonitorName(undefined, "", "abc123"), "monitor-abc123");
});

test("resolveMonitorStateRoot prefers explicit env, then agent dir, then home default", () => {
  assert.equal(
    resolveMonitorStateRoot({ PI_MONITOR_STATE_ROOT: "/tmp/monitor-root" }),
    "/tmp/monitor-root",
  );
  assert.equal(
    resolveMonitorStateRoot({ PI_CODING_AGENT_DIR: "/tmp/pi-agent" }),
    "/tmp/pi-agent/state/monitor",
  );
  assert.match(resolveMonitorStateRoot({}), /\.pi\/agent\/state\/monitor$/);
});

test("claimPendingEvents is owner-scoped and stale processing files are requeued", () => {
  const dirs = makeTempDirs();
  try {
    enqueueMonitorEvent(
      dirs,
      createMonitorEvent({
        monitorId: "monitor-a",
        ownerSessionId: "owner-a",
        ownerSessionFile: "/tmp/owner-a.jsonl",
        kind: "line",
        line: "first line",
      }),
    );
    enqueueMonitorEvent(
      dirs,
      createMonitorEvent({
        monitorId: "monitor-b",
        ownerSessionId: "owner-b",
        ownerSessionFile: "/tmp/owner-b.jsonl",
        kind: "line",
        line: "other line",
      }),
    );

    const claims = claimPendingEvents(dirs, { sessionId: "different-session", sessionFile: "/tmp/owner-a.jsonl" });
    assert.equal(claims.length, 1);
    assert.equal(claims[0].event.monitorId, "monitor-a");
    assert.equal(fs.readdirSync(dirs.processingDir).length, 1);
    assert.equal(fs.readdirSync(dirs.pendingDir).length, 1);

    const oldTime = new Date(Date.now() - 120_000);
    fs.utimesSync(claims[0].processingPath, oldTime, oldTime);
    assert.equal(requeueStaleProcessingEvents(dirs, 60_000), 1);
    assert.equal(fs.readdirSync(dirs.processingDir).length, 0);
    assert.equal(fs.readdirSync(dirs.pendingDir).length, 2);
  } finally {
    cleanupDirs(dirs);
  }
});

test("buildWakePayload groups by monitor and summarizes overflow", () => {
  const claims = [];
  for (let index = 1; index <= 22; index += 1) {
    claims.push({
      event: {
        monitorId: "build-monitor",
        ownerSessionId: "root-session",
        ownerSessionFile: "/tmp/root-session.jsonl",
        kind: "line",
        line: `line ${index}`,
      },
      processingPath: `/tmp/${index}.json`,
    });
  }
  claims.push({
    event: {
      monitorId: "failing-monitor",
      ownerSessionId: "root-session",
      ownerSessionFile: "/tmp/root-session.jsonl",
      kind: "error",
      line: "Monitor exited with code 3.",
      exitCode: 3,
    },
    processingPath: "/tmp/error.json",
  });

  const statesById = new Map([
    ["build-monitor", { id: "build-monitor", name: "Builder" }],
    ["failing-monitor", { id: "failing-monitor", name: "Failure Watch" }],
  ]);

  const payload = buildWakePayload(claims, statesById, 20);
  assert.match(payload.content, /Builder \[build-monitor\]/);
  assert.match(payload.content, /\+2 more/);
  assert.match(payload.content, /Failure Watch \[failing-monitor\] \(failed: exit 3\)/);
  assert.equal(payload.details.monitorCount, 2);
  assert.equal(payload.details.groups[0].hiddenLines, 2);
  assert.equal(payload.details.groups[1].hasError, true);
});

test("reconcileDeadMonitors marks dead active monitors as failed and filters owner-scoped list output", () => {
  const dirs = makeTempDirs();
  try {
    const failedState = createInitialMonitorState({
      id: "dead-monitor",
      owner: createOwner("owner-a"),
      name: "Dead Monitor",
      command: "echo hi",
      cwd: "/workspace/root",
      logPath: createLogPath(dirs, "dead-monitor"),
    });
    writeMonitorState(dirs, {
      ...failedState,
      pid: 999_999,
      status: "running",
    });

    const runningState = createInitialMonitorState({
      id: "live-monitor",
      owner: createOwner("owner-a"),
      name: "Live Monitor",
      command: "echo hi",
      cwd: "/workspace/root",
      logPath: createLogPath(dirs, "live-monitor"),
    });
    writeMonitorState(dirs, {
      ...runningState,
      pid: process.pid,
      status: "running",
    });

    assert.equal(reconcileDeadMonitors(dirs, { sessionFile: "/tmp/owner-a.jsonl" }), 1);
    const dead = readMonitorState(dirs, "dead-monitor");
    assert.equal(dead.status, "failed");
    assert.match(dead.error, /no longer alive/i);

    const ownedActive = filterMonitorStatesForOwner(
      listMonitorStates(dirs),
      { sessionId: "another-session", sessionFile: "/tmp/owner-a.jsonl" },
      false,
    );
    assert.equal(ownedActive.length, 1);
    assert.equal(ownedActive[0].id, "live-monitor");
    assert.match(formatMonitorList(ownedActive, false), /live-monitor/);
  } finally {
    cleanupDirs(dirs);
  }
});

test("monitor ownership prefers session file over transient session id", () => {
  const owner = { sessionId: "new-session-id", sessionFile: "/tmp/root.jsonl" };
  const state = {
    ownerSessionId: "old-session-id",
    ownerSessionFile: "/tmp/root.jsonl",
  };

  assert.equal(hasOwnerIdentity(owner), true);
  assert.equal(monitorMatchesOwner(state, owner), true);
});

test("probeProcessLiveness treats unexpected kill errors as dead with diagnostics", { concurrency: false }, () => {
  const originalKill = process.kill;
  const expectedError = Object.assign(new Error("operation not permitted"), { code: "EPERM" });
  process.kill = () => {
    throw expectedError;
  };

  try {
    const probe = probeProcessLiveness(12345);
    assert.equal(probe.alive, false);
    assert.match(probe.error, /failed to check liveness/i);
    assert.equal(isProcessAlive(12345), false);
  } finally {
    process.kill = originalKill;
  }
});
