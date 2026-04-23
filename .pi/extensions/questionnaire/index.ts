/**
 * Questionnaire Tool - Unified tool for asking single or multiple questions
 *
 * Single question: simple options list
 * Multiple questions: tab bar navigation between questions
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// Types
interface QuestionOption {
	value: string;
	label: string;
	description?: string;
	preview?: string;
}

type RenderOption = QuestionOption & { isOther?: boolean; isDone?: boolean };

interface Question {
	id: string;
	label: string;
	prompt: string;
	options: QuestionOption[];
	allowOther: boolean;
	header?: string;
	multiSelect: boolean;
	enableNotes: boolean;
}

interface Answer {
	id: string;
	value: string;
	label: string;
	wasCustom: boolean;
	index?: number;
}

interface FinalizedSelection {
	value: string;
	label: string;
	display: string;
	preview?: string;
	wasCustom: boolean;
	index?: number;
}

interface QuestionAnnotation {
	notes?: string;
	preview?: string;
	selections?: FinalizedSelection[];
}

interface QuestionnaireResult {
	questions: Question[];
	answers: Answer[];
	cancelled: boolean;
	annotations?: Record<string, QuestionAnnotation>;
}

type UIMode = "selectMode" | "otherInputMode" | "notePromptMode" | "noteInputMode" | "submitReviewMode";

// Schema
const QuestionOptionSchema = Type.Object({
	value: Type.String({ description: "The value returned when selected" }),
	label: Type.String({ description: "Display label for the option" }),
	description: Type.Optional(Type.String({ description: "Optional description shown below label" })),
	preview: Type.Optional(Type.String({ description: "Optional preview shown for the focused option" })),
});

const QuestionSchema = Type.Object({
	id: Type.String({
		description: "Unique identifier for this question",
		maxLength: 128,
	}),
	label: Type.Optional(
		Type.String({
			description: "Short contextual label for tab bar, e.g. 'Scope', 'Priority' (defaults to Q1, Q2)",
		}),
	),
	header: Type.Optional(
		Type.String({
			description: "Short chip label shown before the prompt, max 12 characters",
			maxLength: 12,
		}),
	),
	prompt: Type.String({ description: "The full question text to display" }),
	options: Type.Array(QuestionOptionSchema, { description: "Available options to choose from" }),
	allowOther: Type.Optional(Type.Boolean({ description: "Allow 'Type something' option (default: true)" })),
	multiSelect: Type.Optional(Type.Boolean({ description: "Allow selecting multiple options (default: false)" })),
	enableNotes: Type.Optional(Type.Boolean({ description: "Prompt for an optional note after answering (default: false)" })),
});

const QuestionnaireParams = Type.Object({
	questions: Type.Array(QuestionSchema, { description: "Questions to ask the user" }),
});

function errorResult(
	message: string,
	questions: Question[] = [],
): { content: { type: "text"; text: string }[]; details: QuestionnaireResult } {
	return {
		content: [{ type: "text", text: message }],
		details: { questions, answers: [], cancelled: true },
	};
}

function truncatePlain(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	if (maxLength <= 1) return value.slice(0, maxLength);
	return `${value.slice(0, maxLength - 1)}…`;
}

function buildSelectionSummary(question: Question, answer: Answer, annotation?: QuestionAnnotation): FinalizedSelection[] {
	if (annotation?.selections?.length) {
		return annotation.selections;
	}

	if (!question.multiSelect) {
		if (answer.wasCustom && answer.index === undefined) {
			return [
				{
					value: answer.value,
					label: answer.label,
					display: `(custom) ${answer.label}`,
					wasCustom: true,
				},
			];
		}

		const optionIndex = answer.index ? answer.index - 1 : question.options.findIndex((opt) => opt.value === answer.value);
		const option = optionIndex >= 0 ? question.options[optionIndex] : undefined;
		return [
			{
				value: answer.value,
				label: answer.label,
				display: answer.index ? `${answer.index}. ${answer.label}` : answer.label,
				preview: option?.preview,
				wasCustom: false,
				index: answer.index,
			},
		];
	}

	return [
		{
			value: answer.value,
			label: answer.label,
			display: answer.label,
			wasCustom: answer.wasCustom,
		},
	];
}

function formatAnswer(question: Question, answer: Answer, annotation: QuestionAnnotation | undefined, variant: "content" | "display"): string {
	const selections = buildSelectionSummary(question, answer, annotation);
	if (!question.multiSelect && selections.length === 1 && selections[0].wasCustom && selections[0].index === undefined) {
		return variant === "content" ? `${question.label}: user wrote: ${selections[0].label}` : `(wrote) ${selections[0].label}`;
	}
	const summary = selections.map((item) => item.display).join(", ");
	return variant === "content" ? `${question.label}: user selected: ${summary}` : summary;
}

function buildPreviewText(selections: FinalizedSelection[]): string | undefined {
	const previews = selections.map((selection) => selection.preview).filter((item): item is string => !!item);
	return previews.length > 0 ? previews.join("\n\n") : undefined;
}

function buildPreviewSummary(preview: string): string {
	const firstLine = preview
		.split("\n")
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	if (!firstLine) return "captured";
	return truncatePlain(firstLine, 60);
}

export default function questionnaire(pi: ExtensionAPI) {
	pi.registerTool({
		name: "questionnaire",
		label: "Questionnaire",
		description:
			"Ask the user one or more questions. Use for clarifying requirements, getting preferences, or confirming decisions. For single questions, shows a simple option list. For multiple questions, shows a tab-based interface. Use questionnaire for clarification or decision data gathering. Do not use it for approval-only prompts like ‘Is my plan okay?’",
		parameters: QuestionnaireParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!ctx.hasUI) {
				return errorResult("Error: UI not available (running in non-interactive mode)");
			}
			if (params.questions.length === 0) {
				return errorResult("Error: No questions provided");
			}

			// Normalize questions with defaults
			const questions: Question[] = params.questions.map((q, i) => ({
				...q,
				label: q.label || `Q${i + 1}`,
				allowOther: q.allowOther !== false,
				multiSelect: q.multiSelect === true,
				enableNotes: q.enableNotes === true,
			}));

			const isMultiQuestionnaire = questions.length > 1;
			const totalTabs = questions.length + 1; // questions + Submit

			const result = await ctx.ui.custom<QuestionnaireResult>((tui, theme, _kb, done) => {
				// Explicit state model contract:
				// - selectMode: browse options and commit answers
				// - otherInputMode: edit custom "Other" text for the current question
				// - notePromptMode: after finalizing an answer, offer optional note capture
				// - noteInputMode: edit the optional note for the current question
				// - submitReviewMode: review answers on the Submit tab before final submit
				let currentTab = 0;
				let mode: UIMode = "selectMode";
				let cachedLines: string[] | undefined;
				let cachedWidth: number | undefined;
				let submitWarning: string | undefined;
				const answers = new Map<string, Answer>();
				const selectionSummaryByQuestionId = new Map<string, FinalizedSelection[]>();
				const focusedOptionIndexByQuestionId = new Map<string, number>();
				const selectedOptionIndexesByQuestionId = new Map<string, Set<number>>();
				const otherTextByQuestionId = new Map<string, string>();
				const notesByQuestionId = new Map<string, string>();
				const warningByQuestionId = new Map<string, string>();

				// Editor for "Type something" and optional notes
				const editorTheme: EditorTheme = {
					borderColor: (s) => theme.fg("accent", s),
					selectList: {
						selectedPrefix: (t) => theme.fg("accent", t),
						selectedText: (t) => theme.fg("accent", t),
						description: (t) => theme.fg("muted", t),
						scrollInfo: (t) => theme.fg("dim", t),
						noMatch: (t) => theme.fg("warning", t),
					},
				};
				const editor = new Editor(tui, editorTheme);

				function refresh() {
					cachedLines = undefined;
					cachedWidth = undefined;
					tui.requestRender();
				}

				function currentQuestion(): Question | undefined {
					return questions[currentTab];
				}

				function currentQuestionId(): string | undefined {
					return currentQuestion()?.id;
				}

				function getFocusedIndex(questionId: string): number {
					return focusedOptionIndexByQuestionId.get(questionId) ?? 0;
				}

				function setFocusedIndex(questionId: string, index: number) {
					focusedOptionIndexByQuestionId.set(questionId, Math.max(0, index));
				}

				function getSelectedIndexes(questionId: string): Set<number> {
					let selected = selectedOptionIndexesByQuestionId.get(questionId);
					if (!selected) {
						selected = new Set<number>();
						selectedOptionIndexesByQuestionId.set(questionId, selected);
					}
					return selected;
				}

				function setWarning(questionId: string, warning: string | undefined) {
					if (warning) {
						warningByQuestionId.set(questionId, warning);
					} else {
						warningByQuestionId.delete(questionId);
					}
				}

				function getWarning(questionId: string): string | undefined {
					return warningByQuestionId.get(questionId);
				}

				function submit(cancelled: boolean) {
					const annotations: Record<string, QuestionAnnotation> = {};
					for (const question of questions) {
						const note = notesByQuestionId.get(question.id);
						const selections = selectionSummaryByQuestionId.get(question.id);
						const preview = selections ? buildPreviewText(selections) : undefined;
						if (!note && !preview && !selections?.length) continue;
						annotations[question.id] = {
							...(note ? { notes: note } : {}),
							...(preview ? { preview } : {}),
							...(selections?.length ? { selections } : {}),
						};
					}

					done({
						questions,
						answers: questions.map((question) => answers.get(question.id)).filter((answer): answer is Answer => !!answer),
						cancelled,
						...(Object.keys(annotations).length > 0 ? { annotations } : {}),
					});
				}

				function allAnswered(): boolean {
					return questions.every((question) => answers.has(question.id));
				}

				function otherOptionIndex(question: Question): number {
					return question.options.length;
				}


				function currentOptions(): RenderOption[] {
					const question = currentQuestion();
					if (!question) return [];
					const options: RenderOption[] = [...question.options];
					if (question.allowOther) {
						options.push({ value: "__other__", label: "Type something.", isOther: true });
					}
					if (question.multiSelect) {
						options.push({ value: "__done__", label: "Done →", isDone: true });
					}
					return options;
				}

				function transitionToQuestionTab(tabIndex: number) {
					currentTab = tabIndex;
					mode = currentTab === questions.length ? "submitReviewMode" : "selectMode";
					submitWarning = undefined;
					refresh();
				}

				function advanceAfterAnswer() {
					if (!isMultiQuestionnaire) {
						submit(false);
						return;
					}
					if (currentTab < questions.length - 1) {
						currentTab++;
						mode = "selectMode";
					} else {
						currentTab = questions.length;
						mode = "submitReviewMode";
					}
					submitWarning = undefined;
					refresh();
				}

				function continueAfterNotePrompt() {
					mode = "selectMode";
					editor.setText("");
					advanceAfterAnswer();
				}

				function enterOtherInput(question: Question) {
					mode = "otherInputMode";
					editor.setText(otherTextByQuestionId.get(question.id) ?? "");
					setWarning(question.id, undefined);
					refresh();
				}

				function enterNoteInput(question: Question) {
					mode = "noteInputMode";
					editor.setText(notesByQuestionId.get(question.id) ?? "");
					refresh();
				}

				function finalizeQuestionAnswer(question: Question, answer: Answer, selections: FinalizedSelection[]) {
					answers.set(question.id, answer);
					selectionSummaryByQuestionId.set(question.id, selections);
					setWarning(question.id, undefined);
					if (question.enableNotes) {
						mode = "notePromptMode";
						refresh();
						return;
					}
					advanceAfterAnswer();
				}

				function buildMultiSelectSelections(question: Question): FinalizedSelection[] {
					const selections: FinalizedSelection[] = [];
					const selectedIndexes = getSelectedIndexes(question.id);

					for (let i = 0; i < question.options.length; i++) {
						if (!selectedIndexes.has(i)) continue;
						const option = question.options[i];
						selections.push({
							value: option.value,
							label: option.label,
							display: `${i + 1}. ${option.label}`,
							preview: option.preview,
							wasCustom: false,
							index: i + 1,
						});
					}

					if (question.allowOther && selectedIndexes.has(otherOptionIndex(question))) {
						const otherText = otherTextByQuestionId.get(question.id)?.trim();
						if (otherText) {
							selections.push({
								value: otherText,
								label: otherText,
								display: `(custom) ${otherText}`,
								wasCustom: true,
							});
						}
					}

					return selections;
				}

				function finalizeMultiSelect(question: Question) {
					const selectedIndexes = getSelectedIndexes(question.id);
					if (selectedIndexes.size === 0) {
						setWarning(question.id, "Select at least one option before finishing.");
						refresh();
						return;
					}

					if (question.allowOther && selectedIndexes.has(otherOptionIndex(question))) {
						const otherText = otherTextByQuestionId.get(question.id)?.trim();
						if (!otherText) {
							enterOtherInput(question);
							setWarning(question.id, "Enter a custom value or press Esc to remove Other.");
							return;
						}
					}

					const selections = buildMultiSelectSelections(question);
					const answer: Answer = {
						id: question.id,
						value: selections.map((selection) => selection.value).join(", "),
						label: selections.map((selection) => selection.label).join(", "),
						wasCustom: selections.some((selection) => selection.wasCustom),
					};
					finalizeQuestionAnswer(question, answer, selections);
				}

				function renderPromptLine(question: Question): string {
					if (!question.header) {
						return theme.fg("text", ` ${question.prompt}`);
					}
					const chip = theme.fg("accent", `[${question.header}]`);
					return ` ${chip} ${theme.fg("text", question.prompt)}`;
				}

				function renderTabLabel(question: Question): string {
					const header = question.header ? `[${truncatePlain(question.header, 8)}] ` : "";
					return `${header}${question.label}`;
				}

				function renderPreview(lines: string[], question: Question, width: number) {
					const focusedOption = currentOptions()[getFocusedIndex(question.id)];
					if (!focusedOption?.preview) return;

					lines.push("");
					lines.push(truncateToWidth(theme.fg("muted", " Preview"), width));
					const previewLines = focusedOption.preview.split("\n");
					const visibleLines = previewLines.slice(0, 4);
					for (const line of visibleLines) {
						lines.push(truncateToWidth(`  ${theme.fg("dim", line)}`, width));
					}
					if (previewLines.length > visibleLines.length) {
						lines.push(truncateToWidth(`  ${theme.fg("dim", "…")}`, width));
					}
				}

				function renderOptions(lines: string[], question: Question, width: number) {
					const options = currentOptions();
					const focusedIndex = getFocusedIndex(question.id);
					const selectedIndexes = getSelectedIndexes(question.id);
					const otherText = otherTextByQuestionId.get(question.id);

					for (let i = 0; i < options.length; i++) {
						const option = options[i];
						const focused = i === focusedIndex;
						const prefix = focused ? theme.fg("accent", "> ") : "  ";

						if (option.isDone) {
							const label = focused ? theme.fg("accent", option.label) : theme.fg("text", option.label);
							lines.push(truncateToWidth(`${prefix}${label}`, width));
							continue;
						}

						if (question.multiSelect) {
							const checked = selectedIndexes.has(i) ? "[x]" : "[ ]";
							const label = focused ? theme.fg("accent", option.label) : theme.fg("text", option.label);
							const extra = option.isOther && otherText ? theme.fg("muted", " ✎") : "";
							lines.push(truncateToWidth(`${prefix}${checked} ${label}${extra}`, width));
							if (option.description) {
								lines.push(truncateToWidth(`     ${theme.fg("muted", option.description)}`, width));
							}
							if (option.isOther && otherText) {
								lines.push(truncateToWidth(`     ${theme.fg("dim", otherText)}`, width));
							}
							continue;
						}

						if (option.isOther && mode === "otherInputMode") {
							lines.push(truncateToWidth(prefix + theme.fg("accent", `${i + 1}. ${option.label} ✎`), width));
						} else {
							const color = focused ? "accent" : "text";
							lines.push(truncateToWidth(prefix + theme.fg(color, `${i + 1}. ${option.label}`), width));
						}
						if (option.description) {
							lines.push(truncateToWidth(`     ${theme.fg("muted", option.description)}`, width));
						}
					}
				}

				editor.onSubmit = (value) => {
					const question = currentQuestion();
					if (!question) return;

					if (mode === "otherInputMode") {
						const trimmed = value.trim();
						if (question.multiSelect && !trimmed) {
							setWarning(question.id, "Enter a custom value or press Esc to remove Other.");
							refresh();
							return;
						}

						const finalValue = trimmed || "(no response)";
						const selections: FinalizedSelection[] = [
							{
								value: finalValue,
								label: finalValue,
								display: `(custom) ${finalValue}`,
								wasCustom: true,
							},
						];
						otherTextByQuestionId.set(question.id, finalValue);
						setWarning(question.id, undefined);
						editor.setText("");

						if (question.multiSelect) {
							getSelectedIndexes(question.id).add(otherOptionIndex(question));
							mode = "selectMode";
							refresh();
							return;
						}

						finalizeQuestionAnswer(
							question,
							{ id: question.id, value: finalValue, label: finalValue, wasCustom: true },
							selections,
						);
						return;
					}

					if (mode === "noteInputMode") {
						const trimmed = value.trim();
						if (trimmed) {
							notesByQuestionId.set(question.id, trimmed);
						}
						editor.setText("");
						mode = "selectMode";
						advanceAfterAnswer();
					}
				};

				function handleInput(data: string) {
					if (mode === "otherInputMode") {
						if (matchesKey(data, Key.escape)) {
							const question = currentQuestion();
							if (question?.multiSelect) {
								otherTextByQuestionId.delete(question.id);
								getSelectedIndexes(question.id).delete(otherOptionIndex(question));
								setWarning(question.id, undefined);
							}
							mode = "selectMode";
							editor.setText("");
							refresh();
							return;
						}
						editor.handleInput(data);
						refresh();
						return;
					}

					if (mode === "noteInputMode") {
						if (matchesKey(data, Key.escape)) {
							mode = "selectMode";
							editor.setText("");
							advanceAfterAnswer();
							return;
						}
						editor.handleInput(data);
						refresh();
						return;
					}

					if (mode === "notePromptMode") {
						if (data === "n" || data === "N" || matchesKey(data, "n")) {
							const question = currentQuestion();
							if (question) {
								enterNoteInput(question);
							}
							return;
						}
						if (matchesKey(data, Key.enter)) {
							continueAfterNotePrompt();
							return;
						}
						if (matchesKey(data, Key.escape)) {
							submit(true);
						}
						return;
					}

					if (isMultiQuestionnaire) {
						if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
							transitionToQuestionTab((currentTab + 1) % totalTabs);
							return;
						}
						if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
							transitionToQuestionTab((currentTab - 1 + totalTabs) % totalTabs);
							return;
						}
					}

					if (currentTab === questions.length || mode === "submitReviewMode") {
						if (matchesKey(data, Key.enter)) {
							if (allAnswered()) {
								submit(false);
							} else {
								submitWarning = `Unanswered: ${questions
									.filter((question) => !answers.has(question.id))
									.map((question) => question.label)
									.join(", ")}`;
								refresh();
							}
							return;
						}
						if (matchesKey(data, Key.escape)) {
							submit(true);
						}
						return;
					}

					const question = currentQuestion();
					if (!question) return;
					const options = currentOptions();
					const focusedIndex = getFocusedIndex(question.id);

					if (matchesKey(data, Key.up)) {
						setFocusedIndex(question.id, Math.max(0, focusedIndex - 1));
						refresh();
						return;
					}
					if (matchesKey(data, Key.down)) {
						setFocusedIndex(question.id, Math.min(options.length - 1, focusedIndex + 1));
						refresh();
						return;
					}

					if (question.multiSelect && (matchesKey(data, Key.space) || data === " ")) {
						const selected = getSelectedIndexes(question.id);
						const option = options[focusedIndex];
						if (!option || option.isDone) return;

						if (option.isOther) {
							if (selected.has(focusedIndex)) {
								selected.delete(focusedIndex);
								otherTextByQuestionId.delete(question.id);
								setWarning(question.id, undefined);
								refresh();
								return;
							}
							enterOtherInput(question);
							return;
						}

						if (selected.has(focusedIndex)) {
							selected.delete(focusedIndex);
						} else {
							selected.add(focusedIndex);
						}
						setWarning(question.id, undefined);
						refresh();
						return;
					}

					if (matchesKey(data, Key.enter)) {
						const option = options[focusedIndex];
						if (!option) return;

						if (question.multiSelect) {
							if (option.isDone) {
								finalizeMultiSelect(question);
							}
							return;
						}

						if (option.isOther) {
							enterOtherInput(question);
							return;
						}

						finalizeQuestionAnswer(
							question,
							{
								id: question.id,
								value: option.value,
								label: option.label,
								wasCustom: false,
								index: focusedIndex + 1,
							},
							[
								{
									value: option.value,
									label: option.label,
									display: `${focusedIndex + 1}. ${option.label}`,
									preview: option.preview,
									wasCustom: false,
									index: focusedIndex + 1,
								},
							],
						);
						return;
					}

					if (matchesKey(data, Key.escape)) {
						submit(true);
					}
				}

				function render(width: number): string[] {
					if (cachedLines && cachedWidth === width) return cachedLines;

					const lines: string[] = [];
					const question = currentQuestion();
					const questionId = currentQuestionId();

					const add = (line: string) => lines.push(truncateToWidth(line, width));

					add(theme.fg("accent", "─".repeat(width)));

					if (isMultiQuestionnaire) {
						const tabs: string[] = ["← "];
						for (let i = 0; i < questions.length; i++) {
							const tabQuestion = questions[i];
							const isActive = i === currentTab && mode !== "submitReviewMode";
							const isAnswered = answers.has(tabQuestion.id);
							const marker = isAnswered ? "■" : "□";
							const color = isAnswered ? "success" : "muted";
							const text = ` ${marker} ${renderTabLabel(tabQuestion)} `;
							const styled = isActive ? theme.bg("selectedBg", theme.fg("text", text)) : theme.fg(color, text);
							tabs.push(`${styled} `);
						}
						const canSubmit = allAnswered();
						const isSubmitTab = currentTab === questions.length || mode === "submitReviewMode";
						const submitText = " ✓ Submit ";
						const submitStyled = isSubmitTab
							? theme.bg("selectedBg", theme.fg("text", submitText))
							: theme.fg(canSubmit ? "success" : "dim", submitText);
						tabs.push(`${submitStyled} →`);
						add(` ${tabs.join("")}`);
						lines.push("");
					}

					if (currentTab === questions.length || mode === "submitReviewMode") {
						add(theme.fg("accent", theme.bold(" Ready to submit")));
						lines.push("");
						for (const submitQuestion of questions) {
							const answer = answers.get(submitQuestion.id);
							if (!answer) continue;
							add(
								`${theme.fg("muted", ` ${submitQuestion.label}: `)}${theme.fg(
									"text",
									formatAnswer(submitQuestion, answer, {
										selections: selectionSummaryByQuestionId.get(submitQuestion.id),
									}, "display"),
								)}`,
							);
							const note = notesByQuestionId.get(submitQuestion.id);
							if (note) {
								add(`   ${theme.fg("muted", `note: ${note}`)}`);
							}
						}
						lines.push("");
						if (allAnswered()) {
							add(theme.fg("success", " Press Enter to submit"));
						} else {
							add(theme.fg("warning", ` ${submitWarning ?? "Answer every question before submitting."}`));
						}
					} else if (question && questionId) {
						add(renderPromptLine(question));
						lines.push("");
						renderOptions(lines, question, width);

						const answer = answers.get(question.id);
						const warning = getWarning(questionId);

						if (mode === "otherInputMode") {
							lines.push("");
							add(theme.fg("muted", " Your answer:"));
							for (const line of editor.render(width - 2)) {
								add(` ${line}`);
							}
						} else if (mode === "notePromptMode" && answer) {
							lines.push("");
							add(
								`${theme.fg("muted", " Selected: ")}${theme.fg(
									"text",
									formatAnswer(question, answer, { selections: selectionSummaryByQuestionId.get(question.id) }, "display"),
								)}`,
							);
							const existingNote = notesByQuestionId.get(question.id);
							if (existingNote) {
								add(`${theme.fg("muted", " Current note: ")}${theme.fg("text", existingNote)}`);
							}
						} else if (mode === "noteInputMode" && answer) {
							lines.push("");
							add(
								`${theme.fg("muted", " Selected: ")}${theme.fg(
									"text",
									formatAnswer(question, answer, { selections: selectionSummaryByQuestionId.get(question.id) }, "display"),
								)}`,
							);
							lines.push("");
							add(theme.fg("muted", " Note:"));
							for (const line of editor.render(width - 2)) {
								add(` ${line}`);
							}
						} else if (mode === "selectMode") {
							renderPreview(lines, question, width);
						}

						if (warning) {
							lines.push("");
							add(theme.fg("warning", ` ${warning}`));
						}
					}

					lines.push("");
					if (mode === "otherInputMode") {
						add(theme.fg("dim", " Enter to submit • Esc to cancel"));
					} else if (mode === "notePromptMode") {
						add(theme.fg("dim", " Press n to add note, Enter to continue."));
					} else if (mode === "noteInputMode") {
						add(theme.fg("dim", " Enter to save note • Esc to skip"));
					} else if (mode === "submitReviewMode" || currentTab === questions.length) {
						add(theme.fg("dim", " Tab/←→ navigate • Enter submit • Esc cancel"));
					} else if (question?.multiSelect) {
						add(
							theme.fg(
								"dim",
								isMultiQuestionnaire
									? " Tab/←→ questions • ↑↓ focus • Space toggle • Enter on Done • Esc cancel"
									: " ↑↓ focus • Space toggle • Enter on Done • Esc cancel",
							),
						);
					} else if (isMultiQuestionnaire) {
						add(theme.fg("dim", " Tab/←→ navigate • ↑↓ select • Enter confirm • Esc cancel"));
					} else {
						add(theme.fg("dim", " ↑↓ navigate • Enter select • Esc cancel"));
					}
					add(theme.fg("accent", "─".repeat(width)));

					cachedLines = lines;
					cachedWidth = width;
					return lines;
				}

				return {
					render,
					invalidate: () => {
						cachedLines = undefined;
						cachedWidth = undefined;
					},
					handleInput,
				};
			});

			if (result.cancelled) {
				return {
					content: [{ type: "text", text: "User cancelled the questionnaire" }],
					details: result,
				};
			}

			const answerLines: string[] = [];
			for (const question of questions) {
				const answer = result.answers.find((entry) => entry.id === question.id);
				if (!answer) continue;
				const annotation = result.annotations?.[question.id];
				answerLines.push(formatAnswer(question, answer, annotation, "content"));
				const note = annotation?.notes;
				if (note) {
					answerLines.push(`${question.label}: note: ${note}`);
				}
			}

			return {
				content: [{ type: "text", text: answerLines.join("\n") }],
				details: result,
			};
		},

		renderCall(args, theme, _context) {
			const qs = (args.questions as Question[]) || [];
			const count = qs.length;
			const labels = qs.map((q) => q.label || q.id).join(", ");
			let text = theme.fg("toolTitle", theme.bold("questionnaire "));
			text += theme.fg("muted", `${count} question${count !== 1 ? "s" : ""}`);
			if (labels) {
				text += theme.fg("dim", ` (${truncateToWidth(labels, 40)})`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme, _context) {
			const details = result.details as QuestionnaireResult | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}
			if (details.cancelled) {
				return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			}

			const annotations = details.annotations ?? {};
			const answersById = new Map(details.answers.map((answer) => [answer.id, answer]));
			const lines: string[] = [];

			for (const question of details.questions) {
				const answer = answersById.get(question.id);
				if (!answer) continue;
				const annotation = annotations[question.id];
				lines.push(
					`${theme.fg("success", "✓ ")}${theme.fg("accent", question.id)}: ${theme.fg("text", formatAnswer(question, answer, annotation, "display"))}`,
				);
				if (annotation?.notes) {
					lines.push(`  ${theme.fg("muted", `note: ${annotation.notes}`)}`);
				}
				if (annotation?.preview) {
					lines.push(`  ${theme.fg("dim", `preview: ${buildPreviewSummary(annotation.preview)}`)}`);
				}
			}
			return new Text(lines.join("\n"), 0, 0);
		},
	});
}
