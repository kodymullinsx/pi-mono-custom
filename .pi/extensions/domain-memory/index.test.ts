import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { homedir } from "node:os";
import { isExplicitMemoryMaintenancePrompt, shouldBypassAttachmentRouting } from "./routing-helpers.ts";

const HOME = homedir();

test("bypasses semantic routing for multimodal turns outside memory roots", () => {
	assert.equal(
		shouldBypassAttachmentRouting({
			prompt: "Please inspect these screenshots.",
			cwd: join(HOME, "Projects", "pi-mono-custom"),
			attachments: [{ type: "image" }],
		}),
		true,
	);
});

test("does not bypass when the prompt is explicitly about memory maintenance", () => {
	assert.equal(
		shouldBypassAttachmentRouting({
			prompt: "Please update memory.md with this note.",
			cwd: join(HOME, "Projects", "pi-mono-custom"),
			attachments: [{ type: "document" }],
		}),
		false,
	);
	assert.equal(isExplicitMemoryMaintenancePrompt("please run /endsession"), true);
});

test("does not bypass when already working inside a memory root", () => {
	assert.equal(
		shouldBypassAttachmentRouting({
			prompt: "Review this attachment.",
			cwd: join(HOME, "projects", "Memory", "projects", "pi-agent"),
			attachments: [{ type: "image" }],
		}),
		false,
	);
});

test("keeps normal routing when there are no visual attachments", () => {
	assert.equal(
		shouldBypassAttachmentRouting({
			prompt: "What do you remember about Pi?",
			cwd: join(HOME, "Projects", "pi-mono-custom"),
			attachments: [],
		}),
		false,
	);
});
