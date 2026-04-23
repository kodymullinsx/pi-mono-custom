/**
 * Auto-Commit on Exit Extension
 *
 * Automatically commits changes when the agent exits.
 * Uses the last assistant message to generate a commit message.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const SIGNALS = ["SIGHUP", "SIGTERM"] as const;
const RECENT_SIGNAL_WINDOW_MS = 5_000;
const SIGNAL_TRACKER_KEY = Symbol.for("pi.auto-commit.signal-tracker");

type ShutdownSignal = (typeof SIGNALS)[number];
type SignalTracker = {
	installed: boolean;
	lastSignal?: ShutdownSignal;
	lastSignalAt?: number;
};

function logAutoCommitDecision(message: string): void {
	console.warn(`[auto-commit] ${message}`);
}

function reportAutoCommitMessage(
	ctx: { hasUI: boolean; ui: { notify: (message: string, level: "info" | "warning" | "error") => void } },
	message: string,
	level: "info" | "warning" | "error",
): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, level);
		return;
	}
	logAutoCommitDecision(message);
}

function summarizeGitOutput(stdout: string | undefined, stderr: string | undefined): string {
	return `${stderr ?? ""}\n${stdout ?? ""}`
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0) ?? "";
}

function getSignalTracker(): SignalTracker {
	const globalState = globalThis as typeof globalThis & {
		[SIGNAL_TRACKER_KEY]?: SignalTracker;
	};
	if (!globalState[SIGNAL_TRACKER_KEY]) {
		globalState[SIGNAL_TRACKER_KEY] = { installed: false };
	}
	return globalState[SIGNAL_TRACKER_KEY];
}

function installSignalTracking(): void {
	const tracker = getSignalTracker();
	if (tracker.installed) return;

	for (const signal of SIGNALS) {
		process.on(signal, () => {
			tracker.lastSignal = signal;
			tracker.lastSignalAt = Date.now();
		});
	}

	tracker.installed = true;
}

function consumeRecentShutdownSignal(): { signal?: ShutdownSignal; staleSignal?: ShutdownSignal } {
	const tracker = getSignalTracker();
	if (!tracker.lastSignal || !tracker.lastSignalAt) return {};

	const isRecent = Date.now() - tracker.lastSignalAt <= RECENT_SIGNAL_WINDOW_MS;
	const signal = tracker.lastSignal;
	tracker.lastSignal = undefined;
	tracker.lastSignalAt = undefined;
	return isRecent ? { signal } : { staleSignal: signal };
}

export default function (pi: ExtensionAPI) {
	installSignalTracking();

	pi.on("session_shutdown", async (_event, ctx) => {
		const { signal: shutdownSignal, staleSignal } = consumeRecentShutdownSignal();
		if (shutdownSignal) {
			const message = `Best-effort signal skip: observed ${shutdownSignal} shortly before shutdown, so auto-commit was skipped.`;
			reportAutoCommitMessage(ctx, message, "info");
			return;
		}
		if (staleSignal) {
			const message = `Best-effort signal skip did not engage: observed ${staleSignal} before shutdown, but it was outside the ${RECENT_SIGNAL_WINDOW_MS}ms window, so auto-commit is proceeding.`;
			reportAutoCommitMessage(ctx, message, "warning");
		}

		// Check for uncommitted changes
		const { stdout: status, stderr: statusError, code } = await pi.exec("git", ["status", "--porcelain"]);

		if (code !== 0) {
			const summary = summarizeGitOutput(status, statusError);
			if (/not a git repository/i.test(summary)) {
				reportAutoCommitMessage(
					ctx,
					`Skipping auto-commit: current workspace is not a git repository${summary ? ` (${summary})` : ""}.`,
					"info",
				);
				return;
			}
			reportAutoCommitMessage(
				ctx,
				`Skipping auto-commit: git status failed with exit ${code}${summary ? ` (${summary})` : ""}.`,
				"warning",
			);
			return;
		}
		if (status.trim().length === 0) {
			// No changes
			return;
		}

		// Find the last assistant message for commit context
		const entries = ctx.sessionManager.getEntries();
		let lastAssistantText = "";
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (entry.type === "message" && entry.message.role === "assistant") {
				const content = entry.message.content;
				if (Array.isArray(content)) {
					lastAssistantText = content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join("\n");
				}
				break;
			}
		}

		// Generate a simple commit message
		const firstLine = lastAssistantText.split("\n")[0] || "Work in progress";
		const commitMessage = `[pi] ${firstLine.slice(0, 50)}${firstLine.length > 50 ? "..." : ""}`;

		// Stage and commit
		const { stdout: addOut, stderr: addErr, code: addCode } = await pi.exec("git", ["add", "-A"]);
		if (addCode !== 0) {
			const summary = summarizeGitOutput(addOut, addErr);
			reportAutoCommitMessage(
				ctx,
				`Skipping auto-commit: git add failed with exit ${addCode}${summary ? ` (${summary})` : ""}.`,
				"warning",
			);
			return;
		}

		const { stdout: commitOut, stderr: commitErr, code: commitCode } = await pi.exec("git", ["commit", "-m", commitMessage]);
		if (commitCode === 0) {
			reportAutoCommitMessage(ctx, `Auto-committed: ${commitMessage}`, "info");
			return;
		}

		const summary = summarizeGitOutput(commitOut, commitErr);
		if (/nothing to commit/i.test(summary)) {
			reportAutoCommitMessage(ctx, "Auto-commit found no staged changes left to commit.", "info");
			return;
		}
		reportAutoCommitMessage(
			ctx,
			`Auto-commit failed: git commit exited ${commitCode}${summary ? ` (${summary})` : ""}.`,
			"warning",
		);
	});
}
