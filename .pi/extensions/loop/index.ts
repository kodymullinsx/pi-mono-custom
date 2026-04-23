/**
 * Loop Extension
 *
 * Execute Pi prompts on a recurring schedule in the background.
 * Enables deployment monitoring, health checks, scheduled tasks, etc.
 *
 * Commands:
 *   /loop start <interval> <prompt>  — Start a new loop (min 30s)
 *   /loop stop <id|all>              — Stop a loop or all loops
 *   /loop list                       — List all loops with status
 *   /loop status <id>                — Detailed status of a loop
 *   /loop pause <id>                 — Pause a running loop
 *   /loop resume <id>                — Resume a paused loop
 *   /loop help                       — Show help
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { randomBytes } from "node:crypto";

// --- Types ---

interface LoopState {
  id: string;
  interval: number; // milliseconds
  prompt: string;
  status: "running" | "paused" | "stopped";
  lastRun: number;
  lastResult: string;
  errorCount: number;
  createdAt: number;
  name?: string;
}

// --- State ---

const loops = new Map<string, LoopState>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_CONCURRENT_LOOPS = 10;
const MAX_ERRORS_BEFORE_STOP = 5;

// --- Helpers ---

function parseInterval(str: string): number {
  const match = str.match(/^(\d+)(s|m|h)$/);
  if (!match) {
    throw new Error("Invalid interval. Use format: 30s, 5m, 1h");
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    default:
      throw new Error("Invalid unit. Use: s, m, or h");
  }
}

function formatInterval(ms: number): string {
  if (ms < 60000) return `${ms / 1000}s`;
  if (ms < 3600000) return `${ms / 60000}m`;
  return `${ms / 3600000}h`;
}

function generateId(): string {
  return randomBytes(4).toString("hex");
}

// --- Loop Execution ---

function startLoopTimer(
  loop: LoopState,
  pi: ExtensionAPI,
  ctx: ExtensionContext
) {
  const executeCycle = async () => {
    const currentLoop = loops.get(loop.id);
    if (!currentLoop || currentLoop.status !== "running") {
      timers.delete(loop.id);
      return;
    }

    try {
      // Skip if agent is busy to avoid interrupting user workflow
      if (!ctx.isIdle()) {
        currentLoop.lastResult = "Skipped (agent busy)";
        timers.set(
          loop.id,
          setTimeout(() => executeCycle(), currentLoop.interval)
        );
        return;
      }

      // Send the prompt as a follow-up so it doesn't interrupt
      pi.sendUserMessage(currentLoop.prompt, { deliverAs: "followUp" });

      currentLoop.lastRun = Date.now();
      currentLoop.errorCount = 0;
      currentLoop.lastResult = "Executed successfully";

      ctx.ui.setStatus(
        "loop",
        `${loops.size} loop(s) | last: ${currentLoop.id}`
      );
    } catch (error: any) {
      currentLoop.errorCount++;
      currentLoop.lastResult = `Error: ${error.message}`;

      ctx.ui.notify(
        `Loop "${loop.id}" error (${currentLoop.errorCount}/${MAX_ERRORS_BEFORE_STOP}): ${error.message}`,
        "error"
      );

      if (currentLoop.errorCount >= MAX_ERRORS_BEFORE_STOP) {
        currentLoop.status = "stopped";
        timers.delete(loop.id);
        ctx.ui.notify(
          `Loop "${loop.id}" stopped after ${MAX_ERRORS_BEFORE_STOP} consecutive errors`,
          "error"
        );
        persistLoops(pi);
        return;
      }
    }

    // Schedule next cycle only after this one completes (prevents drift)
    if (currentLoop.status === "running") {
      timers.set(
        loop.id,
        setTimeout(() => executeCycle(), currentLoop.interval)
      );
    }
  };

  // Start the first cycle after one interval
  timers.set(loop.id, setTimeout(() => executeCycle(), loop.interval));
}

function persistLoops(pi: ExtensionAPI) {
  // Persist all current loop states as a single entry
  const loopData = Array.from(loops.values());
  pi.appendEntry("loop-states", loopData);
}

// --- Command Handlers ---

async function handleStart(
  args: string[],
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI
) {
  if (args.length < 2) {
    ctx.ui.notify("Usage: /loop start <interval> <prompt>", "error");
    return;
  }

  const intervalStr = args[0];
  const prompt = args.slice(1).join(" ");

  if (loops.size >= MAX_CONCURRENT_LOOPS) {
    ctx.ui.notify(`Maximum ${MAX_CONCURRENT_LOOPS} loops allowed`, "error");
    return;
  }

  let interval: number;
  try {
    interval = parseInterval(intervalStr);
  } catch (e: any) {
    ctx.ui.notify(`Invalid interval: ${e.message}`, "error");
    return;
  }

  if (interval < 30000) {
    ctx.ui.notify("Minimum interval is 30 seconds", "error");
    return;
  }

  let id = generateId();
  let attempts = 0;
  while (loops.has(id) && attempts < 10) {
    id = generateId();
    attempts++;
  }
  if (loops.has(id)) {
    ctx.ui.notify("Failed to generate unique loop ID", "error");
    return;
  }

  const loop: LoopState = {
    id,
    interval,
    prompt,
    status: "running",
    lastRun: 0,
    lastResult: "",
    errorCount: 0,
    createdAt: Date.now(),
  };

  loops.set(id, loop);
  startLoopTimer(loop, pi, ctx);
  persistLoops(pi);

  ctx.ui.setStatus("loop", `${loops.size} loop(s)`);
  ctx.ui.notify(
    `Loop "${id}" started: "${prompt}" every ${formatInterval(interval)}`,
    "success"
  );
}

async function handleStop(args: string[], ctx: ExtensionCommandContext, pi: ExtensionAPI) {
  if (args.length === 0) {
    ctx.ui.notify("Usage: /loop stop <id> or /loop stop all", "error");
    return;
  }

  const target = args[0];

  if (target === "all") {
    let count = 0;
    for (const [id, loop] of loops) {
      loop.status = "stopped";
      const timer = timers.get(id);
      if (timer) {
        clearTimeout(timer);
        timers.delete(id);
      }
      count++;
    }
    loops.clear();
    ctx.ui.setStatus("loop", "");
    ctx.ui.notify(`Stopped ${count} loop(s)`, "info");
    persistLoops(pi);
    return;
  }

  const loop = loops.get(target);
  if (!loop) {
    ctx.ui.notify(`Loop "${target}" not found`, "error");
    return;
  }

  loop.status = "stopped";
  const timer = timers.get(target);
  if (timer) {
    clearTimeout(timer);
    timers.delete(target);
  }
  loops.delete(target);

  const remaining = loops.size;
  ctx.ui.setStatus("loop", remaining > 0 ? `${remaining} loop(s)` : "");
  ctx.ui.notify(`Loop "${target}" stopped`, "info");
  persistLoops(pi);
}

async function handleList(ctx: ExtensionCommandContext) {
  if (loops.size === 0) {
    ctx.ui.notify(
      "No active loops. Use /loop start <interval> <prompt>",
      "info"
    );
    return;
  }

  const lines: string[] = ["Active Loops:"];

  for (const [_id, loop] of loops) {
    const statusIcon =
      loop.status === "running"
        ? "[running]"
        : loop.status === "paused"
          ? "[paused]"
          : "[stopped]";
    const lastRun = loop.lastRun
      ? `${Math.round((Date.now() - loop.lastRun) / 60000)}m ago`
      : "never";
    const errors = loop.errorCount > 0 ? ` (${loop.errorCount} errors)` : "";

    lines.push(
      `  ${loop.id}: "${loop.prompt}" every ${formatInterval(loop.interval)} ${statusIcon}${errors}`
    );
    lines.push(`    Last run: ${lastRun}`);
  }

  lines.push(`  Total: ${loops.size} loop(s)`);
  ctx.ui.notify(lines.join("\n"), "info");
}

async function handleStatus(args: string[], ctx: ExtensionCommandContext) {
  if (args.length === 0) {
    return handleList(ctx);
  }

  const id = args[0];
  const loop = loops.get(id);

  if (!loop) {
    ctx.ui.notify(`Loop "${id}" not found`, "error");
    return;
  }

  const statusText: Record<string, string> = {
    running: "Running",
    paused: "Paused",
    stopped: "Stopped",
  };

  const lastRunText = loop.lastRun
    ? new Date(loop.lastRun).toLocaleString()
    : "Never";

  const output = [
    `Loop: ${id}`,
    `Prompt: "${loop.prompt}"`,
    `Interval: ${formatInterval(loop.interval)}`,
    `Status: ${statusText[loop.status]}`,
    `Last run: ${lastRunText}`,
    `Last result: ${loop.lastResult || "N/A"}`,
    `Errors: ${loop.errorCount}/${MAX_ERRORS_BEFORE_STOP}`,
    `Created: ${new Date(loop.createdAt).toLocaleString()}`,
  ].join("\n");

  ctx.ui.notify(output, "info");
}

async function handlePause(args: string[], ctx: ExtensionCommandContext, pi: ExtensionAPI) {
  if (args.length === 0) {
    ctx.ui.notify("Usage: /loop pause <id>", "error");
    return;
  }

  const id = args[0];
  const loop = loops.get(id);

  if (!loop) {
    ctx.ui.notify(`Loop "${id}" not found`, "error");
    return;
  }

  if (loop.status !== "running") {
    ctx.ui.notify(`Loop "${id}" is not running`, "error");
    return;
  }

  loop.status = "paused";
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }

  ctx.ui.notify(`Loop "${id}" paused`, "info");
  persistLoops(pi);
}

async function handleResume(
  args: string[],
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI
) {
  if (args.length === 0) {
    ctx.ui.notify("Usage: /loop resume <id>", "error");
    return;
  }

  const id = args[0];
  const loop = loops.get(id);

  if (!loop) {
    ctx.ui.notify(`Loop "${id}" not found`, "error");
    return;
  }

  if (loop.status !== "paused") {
    ctx.ui.notify(`Loop "${id}" is not paused`, "error");
    return;
  }

  loop.status = "running";
  startLoopTimer(loop, pi, ctx);

  ctx.ui.notify(`Loop "${id}" resumed`, "info");
  persistLoops(pi);
}

function showHelp(ctx: ExtensionCommandContext) {
  const help = [
    "Loop Commands:",
    "",
    "/loop start <interval> <prompt>",
    "  Start a new loop. Interval: 30s, 5m, 1h",
    '  Example: /loop start 5m "check deploy status"',
    "",
    "/loop stop <id>",
    "  Stop a running loop. Use 'all' to stop all.",
    "",
    "/loop list",
    "  List all loops with status.",
    "",
    "/loop status <id>",
    "  Show detailed status of a loop.",
    "",
    "/loop pause <id>",
    "  Pause a running loop.",
    "",
    "/loop resume <id>",
    "  Resume a paused loop.",
  ].join("\n");

  ctx.ui.notify(help, "info");
}

// --- Main Extension ---

export default function (pi: ExtensionAPI) {
  // Tool to invoke slash commands programmatically
  pi.registerTool({
    name: "invoke_command",
    description:
      "Invoke a slash command by name. Use this to trigger built-in commands like /loop, /help, /model, etc. The LLM can use this to programmatically execute slash commands.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description:
            "Command name (with or without leading slash)",
        },
        args: {
          type: "string",
          description: "Arguments to pass to the command",
        },
      },
      required: ["command"],
    },
    async execute(_toolCallId, params) {
      // Normalize command: add leading slash if missing
      const command = params.command?.startsWith("/")
        ? params.command
        : `/${params.command}`;

      // Build full input like user would type it
      const fullInput = params.args?.trim()
        ? `${command} ${params.args}`
        : command;

      // Send as user message - Pi's command handler will process it
      // Use deliverAs to queue the message when agent is already processing
      pi.sendUserMessage(fullInput, { deliverAs: "followUp" });

      return {
        content: [
          {
            type: "text" as const,
            text: `Invoked: ${fullInput}`,
          },
        ],
      };
    },
  });

  pi.registerCommand("loop", {
    description:
      "Manage background loop tasks. Start, stop, list, pause, or resume loops.",
    getArgumentCompletions: (prefix: string) => {
      const commands = [
        "start",
        "stop",
        "list",
        "status",
        "pause",
        "resume",
        "help",
      ];
      const filtered = commands.filter((c) => c.startsWith(prefix));
      return filtered.length > 0
        ? filtered.map((c) => ({ value: c, label: c }))
        : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const parts = args.trim().split(/\s+/);
      const command = parts[0] || "help";

      switch (command) {
        case "start":
          return handleStart(parts.slice(1), ctx, pi);
        case "stop":
          return handleStop(parts.slice(1), ctx, pi);
        case "list":
          return handleList(ctx);
        case "status":
          return handleStatus(parts.slice(1), ctx);
        case "pause":
          return handlePause(parts.slice(1), ctx, pi);
        case "resume":
          return handleResume(parts.slice(1), ctx, pi);
        case "help":
        default:
          return showHelp(ctx);
      }
    },
  });

  // Restore loops on session start
  pi.on("session_start", async (_event, ctx) => {
    const runningLoops: LoopState[] = [];

    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "custom" && entry.customType === "loop-states") {
        // Take the most recent loop-states entry
        const states = entry.data as LoopState[];
        // Clear and rebuild from persisted state
        loops.clear();
        for (const loop of states) {
          loops.set(loop.id, loop);
          if (loop.status === "running") {
            runningLoops.push(loop);
          }
        }
      }
    }

    if (runningLoops.length === 0) {
      if (loops.size > 0) {
        ctx.ui.setStatus("loop", `${loops.size} loop(s) [paused]`);
      }
      return;
    }

    // Auto-pause previously running loops to prevent unexpected execution
    for (const loop of runningLoops) {
      loop.status = "paused";
    }

    if (ctx.hasUI) {
      const confirmed = await ctx.ui.confirm(
        "Resume Loops?",
        `You have ${runningLoops.length} loop(s) that were running. Resume them?`
      );

      if (confirmed) {
        for (const loop of runningLoops) {
          loop.status = "running";
          startLoopTimer(loop, pi, ctx);
        }
        ctx.ui.notify(`Resumed ${runningLoops.length} loop(s)`, "success");
      } else {
        ctx.ui.notify(
          "Loops paused. Use /loop resume <id> to start manually.",
          "info"
        );
      }
    }

    if (loops.size > 0) {
      ctx.ui.setStatus("loop", `${loops.size} loop(s)`);
    }
  });

  // Clean up timers on shutdown (loop data already persisted)
  pi.on("session_shutdown", async () => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
  });
}
