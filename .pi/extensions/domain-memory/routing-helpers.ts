import { join } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();
const PROJECTS_MEMORY_ROOT = join(HOME, "projects", "Memory");
const WORK_MEMORY_ROOT = join(HOME, "work", "Memory");

const MEMORY_MAINTENANCE_PATTERNS = [
	/\bmemory\.md\b/i,
	/\b_notes\.md\b/i,
	/\bremember\b/i,
	/\bupdate memory\b/i,
	/\bcreate memory\b/i,
	/\bmemory-creator\b/i,
	/\bendsession\b/i,
	/\/endsession\b/i,
];

function normalizePath(filePath: string): string {
	return filePath.replace(/\\/g, "/").toLowerCase();
}

function isWithinRoot(root: string, targetPath: string): boolean {
	const normalizedRoot = normalizePath(root);
	const normalizedTarget = normalizePath(targetPath);
	return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

function hasVisualAttachments(
	attachments: Array<{ type?: string }> | undefined,
): boolean {
	return (attachments ?? []).some((attachment) => attachment.type === "image" || attachment.type === "document");
}

export function isExplicitMemoryMaintenancePrompt(prompt: string): boolean {
	return MEMORY_MAINTENANCE_PATTERNS.some((pattern) => pattern.test(prompt));
}

export function shouldBypassAttachmentRouting(options: {
	prompt: string;
	cwd: string;
	attachments?: Array<{ type?: string }>;
}): boolean {
	if (!hasVisualAttachments(options.attachments)) {
		return false;
	}
	if (isWithinRoot(PROJECTS_MEMORY_ROOT, options.cwd) || isWithinRoot(WORK_MEMORY_ROOT, options.cwd)) {
		return false;
	}
	if (isExplicitMemoryMaintenancePrompt(options.prompt)) {
		return false;
	}
	return true;
}
