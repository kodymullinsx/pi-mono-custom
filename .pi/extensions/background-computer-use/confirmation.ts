import { createHash } from "node:crypto";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const ACTION_TOOLS = new Set([
	"bcu_click",
	"bcu_scroll",
	"bcu_perform_secondary_action",
	"bcu_move_window",
	"bcu_resize",
	"bcu_set_window_frame",
	"bcu_type_text",
	"bcu_press_key",
	"bcu_set_value",
]);

const CONFIRM_TIMEOUT_MS = 15_000;

interface Approval {
	digest: string;
	expiresAt: number;
}

export interface ApprovalDecision {
	ok: boolean;
	reason?: "missing" | "mismatch";
}

const approvals = new Map<string, Approval>();
let confirmationTail: Promise<void> = Promise.resolve();

function canonicalValue(value: unknown): string {
	if (value === null) return "null";
	if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error("Confirmation input contains a non-finite number.");
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
	if (typeof value === "object") {
		const source = value as Record<string, unknown>;
		return `{${Object.keys(source)
			.filter((key) => source[key] !== undefined)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonicalValue(source[key])}`)
			.join(",")}}`;
	}
	throw new Error(`Confirmation input contains unsupported ${typeof value} data.`);
}

export function canonicalActionDigest(toolName: string, input: unknown): string {
	return createHash("sha256").update(canonicalValue({ toolName, input })).digest("hex");
}

function confirmationSummary(toolName: string, input: unknown): string {
	return [
		`Action: ${toolName}`,
		"",
		"Exact final model input:",
		canonicalValue(input),
		"",
		"Allow this one action?",
	].join("\n");
}

async function inConfirmationQueue<T>(operation: () => Promise<T>): Promise<T> {
	const prior = confirmationTail;
	let release!: () => void;
	confirmationTail = new Promise<void>((resolve) => {
		release = resolve;
	});
	await prior;
	try {
		return await operation();
	} finally {
		release();
	}
}

export async function confirmActionToolCall(
	event: { toolCallId: string; toolName: string; input: unknown },
	ctx: Pick<ExtensionContext, "mode" | "hasUI" | "ui">,
): Promise<{ block: true; reason: string } | undefined> {
	if (!ACTION_TOOLS.has(event.toolName)) return undefined;
	approvals.delete(event.toolCallId);
	if (ctx.mode !== "tui" || !ctx.hasUI) {
		return { block: true, reason: "BackgroundComputerUse actions require confirmation in Pi's interactive TUI." };
	}

	let digest: string;
	try {
		digest = canonicalActionDigest(event.toolName, event.input);
	} catch (error) {
		return { block: true, reason: error instanceof Error ? error.message : String(error) };
	}

	let approved: boolean;
	try {
		approved = await inConfirmationQueue(() =>
			ctx.ui.confirm("Confirm BackgroundComputerUse action", confirmationSummary(event.toolName, event.input), {
				timeout: CONFIRM_TIMEOUT_MS,
			}),
		);
	} catch {
		return { block: true, reason: "BackgroundComputerUse action confirmation was cancelled or aborted." };
	}
	if (!approved) return { block: true, reason: "BackgroundComputerUse action denied, cancelled, or confirmation timed out." };

	approvals.set(event.toolCallId, { digest, expiresAt: Date.now() + CONFIRM_TIMEOUT_MS });
	return undefined;
}

export function consumeActionApproval(toolCallId: string, toolName: string, finalInput: unknown): ApprovalDecision {
	const approval = approvals.get(toolCallId);
	approvals.delete(toolCallId);
	if (!approval || approval.expiresAt <= Date.now()) return { ok: false, reason: "missing" };
	return approval.digest === canonicalActionDigest(toolName, finalInput)
		? { ok: true }
		: { ok: false, reason: "mismatch" };
}

export function clearActionApprovals(): void {
	approvals.clear();
}

export function registerActionConfirmation(pi: ExtensionAPI): void {
	pi.on("tool_call", confirmActionToolCall);
}
