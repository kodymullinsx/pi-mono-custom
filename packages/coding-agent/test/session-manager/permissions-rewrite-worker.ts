import { existsSync, writeFileSync } from "fs";
import { withLockedSessionFile } from "../../src/core/session-file-writer.ts";

const [sessionFile, cwd, readyPath, releasePath] = process.argv.slice(2);
if (!sessionFile || !cwd || !readyPath || !releasePath) {
	throw new Error("Expected session file, cwd, ready path, and release path");
}

const waitState = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
withLockedSessionFile(sessionFile, (lockedSessionFile) => {
	writeFileSync(readyPath, "ready");
	while (!existsSync(releasePath)) {
		Atomics.wait(waitState, 0, 0, 5);
	}
	lockedSessionFile.rewrite([
		{
			type: "session",
			version: 3,
			id: "rewrite-concurrency",
			timestamp: new Date().toISOString(),
			cwd,
		},
		{
			type: "custom",
			customType: "permission-rewrite",
			data: { operation: "rewrite" },
			id: "rewrite-entry",
			parentId: null,
			timestamp: new Date().toISOString(),
		},
	]);
});
