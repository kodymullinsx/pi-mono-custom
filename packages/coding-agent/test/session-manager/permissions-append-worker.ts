import { writeFileSync } from "fs";
import { appendPrivateSessionEntry } from "../../src/core/session-file-writer.ts";

const [sessionFile, workerId, startedPath, completedPath] = process.argv.slice(2);
if (!sessionFile || !workerId) {
	throw new Error("Expected session file and worker id");
}

if (startedPath) {
	writeFileSync(startedPath, "started");
}
appendPrivateSessionEntry(sessionFile, {
	type: "custom",
	customType: "permission-concurrency",
	data: { workerId },
	id: workerId,
	parentId: null,
	timestamp: new Date().toISOString(),
});
if (completedPath) {
	writeFileSync(completedPath, "completed");
}
