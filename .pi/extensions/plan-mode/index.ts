/**
 * Plan Mode Extension
 *
 * Read-only exploration mode for safe implementation planning.
 * When enabled, only read-only tools are available and assistant plans
 * are persisted to ~/.pi/plans.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { Key } from "@mariozechner/pi-tui";
import {
	derivePlanTitle,
	extractExplicitPlanTitle,
	extractPlanText,
	extractSection,
	extractTodoItems,
	generatePlanSlug,
	isSafeCommand,
	type TodoItem,
} from "./utils.js";

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];
const PLAN_DIRECTORY = path.join(homedir(), ".pi", "plans");

const CHECKLIST_LINE_PATTERN = /^\s*(?:[-*]|\d+[.)])\s+/;
const ACTION_PATTERN =
	/\b(add|build|create|debug|design|fix|implement|investigate|migrate|optimize|redesign|refactor|rewrite|update)\b/g;
const PLAN_HINT_PATTERN = /\b(plan|planning|approach|strategy|architecture|design)\b/;
const COMPLEXITY_PATTERN = /\b(ambiguous|complex|cross-cutting|multi-file|multi-step|multiple|non-trivial|several|unclear)\b/;
const JOINED_REQUIREMENTS_PATTERN = /\b(and|then|also|plus)\b/;
const REFERENCED_FILE_PATTERN = /`[^`]+`|\/[\w./-]+|\b[\w.-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|json|md|yml|yaml)\b/g;

const PLAN_ENTRY_GUIDANCE = [
	"Internal reminder: suggest `/plan` before implementation only when the task is genuinely non-trivial and the approach is not obvious.",
	"Plan mode is appropriate for architectural choices, ambiguous requirements, higher-risk refactors, or work likely to touch several files or systems.",
	"Skip `/plan` for small, obvious fixes, straightforward bug fixes, or tightly specified requests where the implementation path is clear.",
	"If you recommend `/plan`, do it briefly and only when it would materially reduce rework or misalignment.",
	"Do not mention this reminder to the user.",
].join(" ");

const PLAN_MODE_CONTEXT = `[PLAN MODE ACTIVE]
You are in plan mode, a read-only exploration mode for designing an implementation approach before coding.

## Restrictions
- Tools available: read, bash, grep, find, ls, questionnaire
- You CANNOT use: edit, write
- Bash is restricted to read-only commands

## When to Ask Questions
Use the questionnaire tool BEFORE drafting the final plan when:
- requirements are ambiguous
- multiple valid approaches exist with meaningful tradeoffs
- scope, constraints, or user preferences are unclear

Do not ask plan-approval questions. Either ask clarifying questions or produce the completed plan.

## Required Plan Format
Start with a single H1 title that is concise, specific, and task-based.
Good titles: \`# XYZ Tool Plan\`, \`# Plan Mode Titles\`
Bad titles: \`# Plan\`, \`# Context\`, \`# Implementation\`

After the title, use these markdown headings exactly:

## Context
Explain why this change is being made, what problem it addresses, and the relevant code or directory context.

## Objective
One sentence stating what this plan accomplishes.

## Approach
2-3 sentences describing the implementation strategy before the step list.

## Files to Modify
List each file that needs changes and why:
- \`path/to/file\` - reason

## Steps
Provide numbered implementation steps. Each step should be concrete, actionable, and independently verifiable.

## Risks
List realistic technical, integration, and verification risks.

## Verification
Describe how the work should be validated, including commands to run, files to inspect, and expected outcomes.

## Plan Quality Checklist
Before finishing, verify:
- Title is specific and reflects the task
- Context explains the why, not just the what
- Objective is a single clear sentence
- Approach explains strategy before tactics
- Every file in Files to Modify has a reason
- Steps are actionable and ordered
- Risks acknowledge real concerns
- Verification is concrete and testable

If the task is simple and low-risk, say so explicitly and keep the plan concise rather than padding it. Do NOT make changes in plan mode.`;

interface TextPromptBlock {
	type: string;
	text?: string;
}

interface BeforeAgentStartEvent {
	prompt?: unknown;
	systemPrompt?: string;
}

interface BashToolCallEvent {
	toolName: string;
	input: {
		command?: unknown;
	};
}

interface PlanModePersistedState {
	enabled?: boolean;
	todos?: TodoItem[];
	planFilePath?: string | null;
	lastPlanText?: string | null;
	planTitle?: string | null;
	planRequestText?: string | null;
}

interface PlanModeStateEntry {
	type: string;
	customType?: string;
	data?: PlanModePersistedState;
}

type PlanSaveResult = { ok: true } | { ok: false; message: string };
type CapturePlanResult =
	| { status: "captured" }
	| { status: "missing" }
	| { status: "error"; message: string };

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
	return message.role === "assistant" && Array.isArray(message.content);
}

function isTextPromptBlock(block: unknown): block is TextPromptBlock {
	return Boolean(block && typeof block === "object" && "type" in block && (block as TextPromptBlock).type === "text");
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function getMessageText(message: AgentMessage): string {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";

	return message.content
		.filter((block): block is TextPromptBlock => isTextPromptBlock(block) && typeof block.text === "string")
		.map((block) => block.text ?? "")
		.join("\n");
}

function getPromptText(prompt: unknown): string {
	if (typeof prompt === "string") return prompt;
	if (!Array.isArray(prompt)) return "";

	const textBlocks: string[] = [];
	for (const block of prompt) {
		if (isTextPromptBlock(block) && typeof block.text === "string") {
			textBlocks.push(block.text);
		}
	}

	return textBlocks.join("\n");
}

function countChecklistLines(text: string): number {
	let count = 0;
	for (const line of text.split(/\r?\n/)) {
		if (CHECKLIST_LINE_PATTERN.test(line.trim())) count += 1;
	}
	return count;
}

function isLikelyPlanModePrompt(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return false;

	const normalized = trimmed.toLowerCase();
	const actionMatches = normalized.match(ACTION_PATTERN) ?? [];
	const referencedFiles = trimmed.match(REFERENCED_FILE_PATTERN) ?? [];

	if (PLAN_HINT_PATTERN.test(normalized)) return true;
	if (countChecklistLines(trimmed) >= 2) return true;
	if (COMPLEXITY_PATTERN.test(normalized) && actionMatches.length >= 1) return true;
	if (actionMatches.length >= 2 && (JOINED_REQUIREMENTS_PATTERN.test(normalized) || referencedFiles.length >= 2)) {
		return true;
	}
	return actionMatches.length >= 3;
}

const MAX_PLAN_SLUG_RETRIES = 10;

function getPlanTitle(messageText: string, planText: string, items: TodoItem[], requestText: string | null): string {
	const explicitTitle = extractExplicitPlanTitle(messageText);
	if (explicitTitle) return explicitTitle;

	if (requestText) {
		const requestTitle = derivePlanTitle(requestText);
		if (requestTitle) return requestTitle;
	}

	const objective = extractSection(planText, "Objective");
	if (objective) {
		const objectiveTitle = derivePlanTitle(objective);
		if (objectiveTitle) return objectiveTitle;
		return objective.replace(/\.$/, "");
	}

	if (items[0]?.text) {
		const stepTitle = derivePlanTitle(items[0].text);
		if (stepTitle) return stepTitle;
		return items[0].text.replace(/\.{3}$/, "");
	}

	return "Untitled Plan";
}

function buildPlanMarkdown(title: string, planText: string, items: TodoItem[], status: string): string {
	const updatedAt = new Date().toISOString();
	const context = extractSection(planText, "Context");
	const objective = extractSection(planText, "Objective");
	const approach = extractSection(planText, "Approach");
	const files = extractSection(planText, "Files to Modify");
	const risks = extractSection(planText, "Risks");
	const verification = extractSection(planText, "Verification");
	const checklist =
		items.length > 0 ? items.map((item) => `- [ ] ${item.step}. ${item.text}`).join("\n") : "_No steps extracted._";

	return `# ${title}

- Status: ${status}
- Updated: ${updatedAt}

## Context
${context || "_No context provided._"}

## Objective
${objective || "_No objective provided._"}

## Approach
${approach || "_No approach provided._"}

## Files to Modify
${files || "_No files specified._"}

## Steps
${checklist}

## Risks
${risks || "_No risks identified._"}

## Verification
${verification || "_No verification criteria provided._"}

---

## Raw Plan
${planText}
`;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
	return Boolean(error && typeof error === "object" && "code" in error);
}

function isFileNotFoundError(error: unknown): boolean {
	return isErrnoException(error) && error.code === "ENOENT";
}

export default function planModeExtension(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let todoItems: TodoItem[] = [];
	let planFilePath: string | null = null;
	let lastPlanText: string | null = null;
	let planTitle: string | null = null;
	let planRequestText: string | null = null;

	function restoreAllTools(): void {
		pi.setActiveTools(pi.getAllTools().map((tool) => tool.name));
	}

	function applyToolRestrictions(): void {
		if (planModeEnabled) {
			pi.setActiveTools(PLAN_MODE_TOOLS);
			return;
		}

		restoreAllTools();
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: planModeEnabled,
			todos: todoItems,
			planFilePath,
			lastPlanText,
			planTitle,
			planRequestText,
		});
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (planModeEnabled) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ plan"));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}
		ctx.ui.setWidget("plan-todos", undefined);
	}

	function clearPlanDraftState(): void {
		todoItems = [];
		planFilePath = null;
		lastPlanText = null;
		planTitle = null;
		planRequestText = null;
	}

	function exitPlanMode(ctx: ExtensionContext): void {
		planModeEnabled = false;
		clearPlanDraftState();
		applyToolRestrictions();
		updateStatus(ctx);
		persistState();
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		if (planModeEnabled) {
			const savedPath = planFilePath;
			exitPlanMode(ctx);
			ctx.ui.notify(
				savedPath
					? `Plan mode disabled. Latest plan remains at ${savedPath}. Full access restored.`
					: "Plan mode disabled. Full access restored.",
			);
			return;
		}

		clearPlanDraftState();
		planModeEnabled = true;
		applyToolRestrictions();
		updateStatus(ctx);
		persistState();
		ctx.ui.notify(`Plan mode enabled. Tools: ${PLAN_MODE_TOOLS.join(", ")}`);
	}

	async function removePlanFile(filePath: string | null): Promise<PlanSaveResult> {
		if (!filePath) return { ok: true };

		try {
			await unlink(filePath);
			return { ok: true };
		} catch (error) {
			if (isFileNotFoundError(error)) return { ok: true };
			console.warn("[Plan Mode] Failed to remove plan file:", error);
			return { ok: false, message: `Failed to remove saved plan file ${filePath}: ${getErrorMessage(error)}` };
		}
	}

	async function persistPlanFile(status = "planning"): Promise<PlanSaveResult> {
		if (!planFilePath || !lastPlanText) {
			return { ok: false, message: "Plan mode could not save the plan because no plan content is available." };
		}

		try {
			await mkdir(PLAN_DIRECTORY, { recursive: true });
			const title = planTitle ?? getPlanTitle(lastPlanText, lastPlanText, todoItems, planRequestText);
			const markdown = buildPlanMarkdown(title, lastPlanText, todoItems, status);
			await writeFile(planFilePath, markdown, "utf8");
			return { ok: true };
		} catch (error) {
			console.error("[Plan Mode] Failed to persist plan file:", error);
			return { ok: false, message: `Failed to save plan to ${planFilePath}: ${getErrorMessage(error)}` };
		}
	}

	async function ensurePlanFilePath(): Promise<string> {
		if (planFilePath) return planFilePath;

		try {
			await mkdir(PLAN_DIRECTORY, { recursive: true });
		} catch (error) {
			if (isErrnoException(error) && error.code === "EACCES") {
				throw new Error(`Cannot create plans directory: permission denied. Check permissions for ${PLAN_DIRECTORY}`);
			}
			if (isErrnoException(error) && error.code === "ENOSPC") {
				throw new Error("Cannot create plans directory: disk is full");
			}
			throw new Error(`Failed to create plans directory: ${getErrorMessage(error)}`);
		}

		for (let attempt = 0; attempt < MAX_PLAN_SLUG_RETRIES; attempt += 1) {
			const candidate = path.join(PLAN_DIRECTORY, `${generatePlanSlug()}.md`);
			try {
				await access(candidate);
			} catch (error) {
				if (!isFileNotFoundError(error)) {
					console.error("[Plan Mode] Error checking plan file path:", error);
					throw error;
				}
				planFilePath = candidate;
				return candidate;
			}
		}

		const fallbackCandidate = path.join(PLAN_DIRECTORY, `plan-${Date.now()}.md`);
		planFilePath = fallbackCandidate;
		return fallbackCandidate;
	}

	async function capturePlan(messageText: string): Promise<CapturePlanResult> {
		const planText = extractPlanText(messageText);
		if (!planText) return { status: "missing" };

		try {
			const explicitTitle = extractExplicitPlanTitle(messageText);
			todoItems = extractTodoItems(planText);
			planTitle = getPlanTitle(messageText, planText, todoItems, planRequestText);
			lastPlanText = explicitTitle ? `# ${explicitTitle}\n\n${planText}` : planText;
			await ensurePlanFilePath();
			const saveResult = await persistPlanFile();
			if (!saveResult.ok) {
				return { status: "error", message: saveResult.message };
			}
			return { status: "captured" };
		} catch (error) {
			console.error("[Plan Mode] Failed to capture plan:", error);
			return { status: "error", message: `Failed to capture plan: ${getErrorMessage(error)}` };
		}
	}

	function showPlanStepsPreview(): void {
		if (todoItems.length === 0) return;

		const todoListText = todoItems.map((item) => `${item.step}. ☐ ${item.text}`).join("\n");
		pi.sendMessage(
			{
				customType: "plan-todo-list",
				content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`,
				display: true,
			},
			{ triggerTurn: false },
		);
	}

	async function handlePlanProceed(ctx: ExtensionContext): Promise<boolean> {
		const savedPath = planFilePath;
		const saveResult = await persistPlanFile("ready");
		if (!saveResult.ok) {
			ctx.ui.notify(
				`${saveResult.message} Plan mode remains active. Choose another action or try proceeding again after resolving the save issue.`,
				"warning",
			);
			persistState();
			return false;
		}

		exitPlanMode(ctx);
		pi.sendMessage(
			{
				customType: "plan-complete",
				content: savedPath
					? `Plan saved to ${savedPath}\n\nYou can now proceed with implementation.`
					: "Plan mode exited. You can now proceed with implementation.",
				display: true,
			},
			{ triggerTurn: false },
		);
		return true;
	}

	async function handlePlanRefine(ctx: ExtensionContext): Promise<void> {
		const refinement = await ctx.ui.editor("What would you like to change?", "");
		if (refinement?.trim()) {
			pi.sendUserMessage(`Please revise the current plan based on this feedback:\n\n${refinement.trim()}`);
		}
	}

	function handlePlanStay(ctx: ExtensionContext): void {
		ctx.ui.notify("Plan mode stays active. Ask for revisions when you're ready.");
	}

	async function handlePlanDiscard(ctx: ExtensionContext): Promise<void> {
		const discardedPlanPath = planFilePath;
		const removeResult = await removePlanFile(discardedPlanPath);
		exitPlanMode(ctx);

		if (!removeResult.ok) {
			ctx.ui.notify(`${removeResult.message} Plan mode was exited, but the file still exists.`, "warning");
			return;
		}

		ctx.ui.notify("Plan mode exited. Plan discarded.");
	}

	function restorePlanModeState(entry: PlanModeStateEntry | undefined): void {
		const data = entry?.data;
		if (!data?.enabled) return;

		planModeEnabled = true;
		todoItems = data.todos ?? [];
		planFilePath = data.planFilePath ?? null;
		lastPlanText = data.lastPlanText ?? null;
		planTitle = data.planTitle ?? null;
		planRequestText = data.planRequestText ?? null;
	}

	async function restorePlanFile(ctx: ExtensionContext): Promise<void> {
		if (!planModeEnabled || !lastPlanText) return;

		try {
			if (!planFilePath) {
				await ensurePlanFilePath();
			}

			const saveResult = await persistPlanFile();
			if (!saveResult.ok) {
				ctx.ui.notify(saveResult.message, "warning");
			}
		} catch (error) {
			const message = `Failed to restore plan file: ${getErrorMessage(error)}`;
			console.error("[Plan Mode] Failed to restore plan file:", error);
			ctx.ui.notify(message, "warning");
		}
	}

	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	pi.on("tool_call", async (event) => {
		const toolCall = event as BashToolCallEvent;
		if (!planModeEnabled || toolCall.toolName !== "bash") return;

		const command = typeof toolCall.input.command === "string" ? toolCall.input.command : "";
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `Plan mode: command blocked (not allowlisted). Use /plan to disable plan mode first.\nCommand: ${command}`,
			};
		}
	});

	function isPlanModeMessage(message: AgentMessage & { customType?: string }): boolean {
		if (message.customType === "plan-mode-context") return false;
		if (message.role !== "user") return true;

		const content = message.content;
		if (typeof content === "string") {
			return !content.includes("[PLAN MODE ACTIVE]");
		}
		if (Array.isArray(content)) {
			return !content.some(
				(block) => block.type === "text" && (block as TextContent).text?.includes("[PLAN MODE ACTIVE]"),
			);
		}
		return true;
	}

	pi.on("context", async (event) => {
		if (planModeEnabled) return;

		return {
			messages: event.messages.filter((message) => isPlanModeMessage(message as AgentMessage & { customType?: string })),
		};
	});

	pi.on("before_agent_start", async (event) => {
		const agentStartEvent = event as BeforeAgentStartEvent;
		if (planModeEnabled) {
			const promptText = getPromptText(agentStartEvent.prompt).trim();
			if (!planRequestText && promptText) {
				planRequestText = promptText;
				persistState();
			}

			return {
				message: {
					customType: "plan-mode-context",
					content: PLAN_MODE_CONTEXT,
					display: false,
				},
			};
		}

		const promptText = getPromptText(agentStartEvent.prompt);
		if (!isLikelyPlanModePrompt(promptText)) return;

		return {
			systemPrompt: `${agentStartEvent.systemPrompt ?? ""}\n\n${PLAN_ENTRY_GUIDANCE}`,
		};
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!planModeEnabled || !ctx.hasUI) return;

		if (!planRequestText) {
			const lastUserMessage = [...event.messages].reverse().find((message) => message.role === "user");
			const requestText = lastUserMessage ? getMessageText(lastUserMessage).trim() : "";
			if (requestText) {
				planRequestText = requestText;
			}
		}

		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (!lastAssistant) return;

		const captureResult = await capturePlan(getTextContent(lastAssistant));
		if (captureResult.status === "missing") {
			persistState();
			return;
		}
		if (captureResult.status === "error") {
			ctx.ui.notify(captureResult.message, "warning");
			persistState();
			return;
		}

		if (planFilePath) {
			ctx.ui.notify(`Plan saved to ${planFilePath}`);
		}
		persistState();
		showPlanStepsPreview();

		while (planModeEnabled) {
			const choice = await ctx.ui.select("What next?", [
				"Begin implementation",
				"Refine the plan",
				"Stay in plan mode",
				"Discard plan and exit",
			]);
			if (!choice) return;

			if (choice === "Begin implementation") {
				const proceeded = await handlePlanProceed(ctx);
				if (proceeded) return;
				continue;
			}
			if (choice === "Refine the plan") {
				await handlePlanRefine(ctx);
				return;
			}
			if (choice === "Stay in plan mode") {
				handlePlanStay(ctx);
				return;
			}
			await handlePlanDiscard(ctx);
			return;
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		const entries = ctx.sessionManager.getEntries();
		const planModeEntry = entries
			.filter((entry: PlanModeStateEntry) => entry.type === "custom" && entry.customType === "plan-mode")
			.pop();

		restorePlanModeState(planModeEntry);
		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
		}

		applyToolRestrictions();
		await restorePlanFile(ctx);
		updateStatus(ctx);
	});
}
