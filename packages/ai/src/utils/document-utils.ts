import type { AssistantErrorMetadata, AttachmentRetryTarget, DocumentContent } from "../types.js";

export class AttachmentSerializationError extends Error {
	readonly errorMetadata: AssistantErrorMetadata;

	constructor(message: string, targets: AttachmentRetryTarget[]) {
		super(message);
		this.name = "AttachmentSerializationError";
		this.errorMetadata = {
			local: true,
			attachmentRetryTargets: targets,
		};
	}
}

export function formatDocumentSummary(block: DocumentContent): string {
	const name = block.fileName ?? "document";
	return `[document attached: ${name} (${block.mimeType})]`;
}

export function canInlineDocument(block: DocumentContent): boolean {
	return block.mimeType === "application/pdf";
}

export function throwUnsupportedDocumentSerialization(block: DocumentContent, location: string): never {
	const name = block.fileName ?? "document";
	throw new AttachmentSerializationError(
		`This OpenAI-compatible ${location} cannot accept first-class documents yet (${name}, ${block.mimeType}). Convert the file to PDF pages/images or extracted text before sending it to this model.`,
		["document"],
	);
}

export function getAssistantErrorMetadata(error: unknown): AssistantErrorMetadata | undefined {
	if (error instanceof AttachmentSerializationError) {
		return error.errorMetadata;
	}
	return undefined;
}
