import type { ArtifactObservation } from "./artifact-index.ts";

export interface FileOpsLike {
	read?: Iterable<string>;
	written?: Iterable<string>;
	edited?: Iterable<string>;
}

export interface SummaryPromptInput {
	conversationText: string;
	previousSummary?: string;
	readFiles: string[];
	modifiedFiles: string[];
	artifacts: ArtifactObservation[];
}

function toSortedUniqueStrings(values: Iterable<string> | undefined): string[] {
	if (!values) return [];
	return [...new Set([...values].filter((value) => typeof value === "string" && value.length > 0))].sort();
}

function formatArtifactBullet(observation: ArtifactObservation): string {
	if (!observation.previewText) return `- ${observation.note}`;
	return `- ${observation.note}. Preview: ${observation.previewText}`;
}

function formatArtifactSection(artifacts: ArtifactObservation[]): string {
	if (artifacts.length === 0) return "(none)";
	return artifacts.map(formatArtifactBullet).join("\n");
}

function formatFileList(title: string, items: string[]): string {
	if (items.length === 0) return `${title}:\n- (none)`;
	return `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

export function computeFileLists(fileOps: FileOpsLike): { readFiles: string[]; modifiedFiles: string[] } {
	const read = toSortedUniqueStrings(fileOps.read);
	const modified = toSortedUniqueStrings([...(fileOps.written ?? []), ...(fileOps.edited ?? [])]);
	const modifiedSet = new Set(modified);
	return {
		readFiles: read.filter((item) => !modifiedSet.has(item)),
		modifiedFiles: modified,
	};
}

export function buildSummaryPromptText(input: SummaryPromptInput): string {
	const sections = [`<conversation>\n${input.conversationText}\n</conversation>`];

	if (input.previousSummary) {
		sections.push(`<previous-summary>\n${input.previousSummary}\n</previous-summary>`);
	}

	sections.push(
		`<file-operations>\n${formatFileList("Read-only files", input.readFiles)}\n\n${formatFileList("Modified files", input.modifiedFiles)}\n</file-operations>`,
	);
	sections.push(`<tool-output-observations>\n${formatArtifactSection(input.artifacts)}\n</tool-output-observations>`);
	sections.push(`You are a context summarization assistant. Produce a structured markdown summary that another coding agent can use to continue the work.

Use this exact top-level structure:

## Goal
## Constraints & Preferences
## Progress
### Done
### In Progress
### Blocked
## Key Decisions
## Next Steps
## Critical Context

Requirements:
- Preserve exact file paths, function names, commands, and error text when they matter.
- Treat the file-operation and tool-output sections as supporting evidence, not as separate tasks.
- Be concise, but do not omit blockers, pending work, or repeated large-output patterns that matter to continuation.
- Do not continue the conversation or answer any user request directly. Only return the summary.`);

	return sections.join("\n\n");
}

export function appendDeterministicSummarySections(
	summary: string,
	input: { readFiles: string[]; modifiedFiles: string[]; artifacts: ArtifactObservation[] },
): string {
	let output = summary.trim();

	if (input.artifacts.length > 0) {
		output += `\n\n## Tool output notes\n${input.artifacts.map(formatArtifactBullet).join("\n")}`;
	}

	if (input.readFiles.length > 0 || input.modifiedFiles.length > 0) {
		output += `\n\n## File operations\n${formatFileList("Read-only files", input.readFiles)}\n\n${formatFileList("Modified files", input.modifiedFiles)}`;
	}

	return output;
}

