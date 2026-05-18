import type { AttachmentContent } from "@earendil-works/pi-ai";
import type { Args } from "./args.js";

export interface InitialMessageInput {
	parsed: Args;
	fileText?: string;
	fileAttachments?: AttachmentContent[];
	stdinContent?: string;
}

export interface InitialMessageResult {
	initialMessage?: string;
	initialAttachments?: AttachmentContent[];
}

/**
 * Combine stdin content, @file text, and the first CLI message into a single
 * initial prompt for non-interactive mode.
 */
export function buildInitialMessage({
	parsed,
	fileText,
	fileAttachments,
	stdinContent,
}: InitialMessageInput): InitialMessageResult {
	const parts: string[] = [];
	if (stdinContent !== undefined) {
		parts.push(stdinContent);
	}
	if (fileText) {
		parts.push(fileText);
	}

	if (parsed.messages.length > 0) {
		parts.push(parsed.messages[0]);
		parsed.messages.shift();
	}

	return {
		initialMessage: parts.length > 0 ? parts.join("") : undefined,
		initialAttachments: fileAttachments && fileAttachments.length > 0 ? fileAttachments : undefined,
	};
}
