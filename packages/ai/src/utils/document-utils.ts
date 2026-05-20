import type { AssistantErrorMetadata, AttachmentRetryTarget, DocumentContent } from "../types.js";

export type AttachmentLocation = "user messages" | "tool results";

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

const CONTROL_CHARS_PATTERN = /[\x00-\x1f\x7f]+/g;
const MAX_DISPLAY_NAME_LENGTH = 128;
// RFC 6838 type/subtype. MIME parameters are stripped before validation.
// Allow letters, digits, and "._+-/" so common values like application/vnd.ms-excel survive intact.
const ALLOWED_MIME_PATTERN = /^[a-zA-Z0-9._+-]+\/[a-zA-Z0-9._+-]+$/;

export function sanitizeDocumentDisplayName(fileName: string | undefined): string {
	if (!fileName) return "document";
	const stripped = fileName.replace(CONTROL_CHARS_PATTERN, " ").replace(/\s+/g, " ").trim();
	if (stripped.length === 0) return "document";
	return stripped.length > MAX_DISPLAY_NAME_LENGTH ? `${stripped.slice(0, MAX_DISPLAY_NAME_LENGTH - 1)}…` : stripped;
}

export function sanitizeAttachmentMimeType(mimeType: string | undefined): string {
	if (!mimeType) return "application/octet-stream";
	const bareType = mimeType.split(";", 1)[0]?.trim();
	if (!bareType || !ALLOWED_MIME_PATTERN.test(bareType)) return "application/octet-stream";
	return bareType.toLowerCase();
}

export function formatDocumentSummary(block: DocumentContent): string {
	return `[document attached: ${sanitizeDocumentDisplayName(block.fileName)} (${sanitizeAttachmentMimeType(block.mimeType)})]`;
}

export function canInlineDocument(block: DocumentContent): boolean {
	return sanitizeAttachmentMimeType(block.mimeType) === "application/pdf";
}

export function throwUnsupportedDocumentSerialization(block: DocumentContent, location: AttachmentLocation): never {
	throw new AttachmentSerializationError(
		`This OpenAI-compatible ${location} cannot accept first-class documents yet (${sanitizeDocumentDisplayName(block.fileName)}, ${sanitizeAttachmentMimeType(block.mimeType)}). Convert the file to PDF pages/images or extracted text before sending it to this model.`,
		["document"],
	);
}

export function getAssistantErrorMetadata(error: unknown): AssistantErrorMetadata | undefined {
	if (error instanceof AttachmentSerializationError) {
		return error.errorMetadata;
	}
	return undefined;
}
