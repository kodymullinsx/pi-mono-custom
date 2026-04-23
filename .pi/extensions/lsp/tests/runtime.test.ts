import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	LspRuntime,
	RequestCancelledError,
	RequestTimeoutError,
	applyDocumentUpdate,
	createDocumentState,
	filterIgnoredPaths,
	requestWithTimeout,
	toDocumentUri,
	toProtocolPosition,
} from "../runtime.ts";

test("requestWithTimeout rejects when the request times out", async () => {
	await assert.rejects(
		requestWithTimeout(
			{
				sendRequest: async () =>
					await new Promise<never>(() => {
						// Intentionally never resolves.
					}),
			},
			"textDocument/definition",
			{},
			20,
		),
		RequestTimeoutError,
	);
});

test("requestWithTimeout rejects when the request is cancelled", async () => {
	const controller = new AbortController();
	const promise = requestWithTimeout(
		{
			sendRequest: async () =>
				await new Promise<never>(() => {
					// Intentionally never resolves.
				}),
		},
		"textDocument/hover",
		{},
		100,
		controller.signal,
	);

	controller.abort();
	await assert.rejects(promise, RequestCancelledError);
});

test("toProtocolPosition converts 1-based coordinates to LSP 0-based coordinates", () => {
	assert.deepEqual(toProtocolPosition({ line: 7, column: 4 }), {
		line: 6,
		character: 3,
	});
});

test("applyDocumentUpdate only increments versions when the file contents change", () => {
	const initial = createDocumentState("file:///tmp/example.ts", "/tmp/example.ts", "typescript", "first");
	const unchanged = applyDocumentUpdate(initial, "first");
	assert.equal(unchanged.changed, false);
	assert.equal(unchanged.next.version, 1);

	const changed = applyDocumentUpdate(initial, "second");
	assert.equal(changed.changed, true);
	assert.equal(changed.next.version, 2);
	assert.equal(changed.next.text, "second");
});

test("filterIgnoredPaths reports interrupted gitignore filtering instead of silently abandoning it", { concurrency: false }, async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-lsp-filter-"));
	const binDir = path.join(tempRoot, "bin");
	const repoRoot = path.join(tempRoot, "repo");
	const scriptPath = path.join(binDir, "git");
	const originalPath = process.env.PATH ?? "";

	try {
		await fs.mkdir(binDir, { recursive: true });
		await fs.mkdir(repoRoot, { recursive: true });
		await fs.writeFile(
			scriptPath,
			`#!/bin/sh
if [ "$1" = "-C" ]; then
  repo="$2"
  shift 2
fi
if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then
  printf '%s\\n' "$repo"
  exit 0
fi
if [ "$1" = "check-ignore" ] && [ "$2" = "--stdin" ]; then
  exit 2
fi
exit 1
`,
			{ mode: 0o755 },
		);
		process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;

		const keptFile = path.join(repoRoot, "src", "kept.ts");
		const ignoredFile = path.join(repoRoot, "dist", "ignored.ts");
		const result = await filterIgnoredPaths(repoRoot, [
			{ path: keptFile },
			{ path: ignoredFile },
		]);

		assert.equal(result.filtered, 0);
		assert.equal(result.filterAbandoned, true);
		assert.match(result.filterWarning ?? "", /Gitignore check command failed|check-ignore/i);
		assert.deepEqual(
			result.kept.map((item) => item.path).sort(),
			[ignoredFile, keptFile].sort(),
		);
	} finally {
		process.env.PATH = originalPath;
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
});

test("filterIgnoredPaths surfaces git root probe failures instead of silently disabling filtering", { concurrency: false }, async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-lsp-root-probe-"));
	const binDir = path.join(tempRoot, "bin");
	const repoRoot = path.join(tempRoot, "repo");
	const scriptPath = path.join(binDir, "git");
	const originalPath = process.env.PATH ?? "";

	try {
		await fs.mkdir(binDir, { recursive: true });
		await fs.mkdir(repoRoot, { recursive: true });
		await fs.writeFile(
			scriptPath,
			`#!/bin/sh
if [ "$1" = "-C" ]; then
  repo="$2"
  shift 2
fi
if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then
  echo "fatal: failed to inspect repo root" >&2
  exit 128
fi
exit 1
`,
			{ mode: 0o755 },
		);
		process.env.PATH = `${binDir}${path.delimiter}${originalPath}`;

		const keptFile = path.join(repoRoot, "src", "kept.ts");
		const result = await filterIgnoredPaths(repoRoot, [{ path: keptFile }]);

		assert.equal(result.filtered, 0);
		assert.equal(result.filterAbandoned, true);
		assert.match(result.filterWarning ?? "", /Git root probe failed/);
		assert.deepEqual(result.kept.map((item) => item.path), [keptFile]);
	} finally {
		process.env.PATH = originalPath;
		await fs.rm(tempRoot, { recursive: true, force: true });
	}
});

test("syncDocument surfaces didOpen notification failures and leaves document state unchanged", async () => {
	const runtime = new LspRuntime();
	const filePath = "/tmp/example.ts";
	const entry = {
		connection: {
			sendNotification: async (method: string) => {
				assert.equal(method, "textDocument/didOpen");
				throw new Error("write failed");
			},
		},
		capabilities: { textDocumentSync: 1 },
		config: { languageId: "typescript" },
		openDocs: new Map(),
		lastError: undefined,
	} as any;

	await assert.rejects(
		(runtime as any).syncDocument(entry, filePath, "const value = 1;\n"),
		/error|didOpen|write failed/i,
	);
	assert.equal(entry.openDocs.size, 0);
	assert.match(entry.lastError ?? "", /textDocument\/didOpen/);
});

test("syncDocument surfaces didChange notification failures and keeps the previous document version", async () => {
	const runtime = new LspRuntime();
	const filePath = "/tmp/example.ts";
	const uri = toDocumentUri(filePath);
	const existing = createDocumentState(uri, filePath, "typescript", "first");
	const entry = {
		connection: {
			sendNotification: async (method: string) => {
				assert.equal(method, "textDocument/didChange");
				throw new Error("write failed");
			},
		},
		capabilities: { textDocumentSync: 1 },
		config: { languageId: "typescript" },
		openDocs: new Map([[uri, existing]]),
		lastError: undefined,
	} as any;

	await assert.rejects(
		(runtime as any).syncDocument(entry, filePath, "second"),
		/error|didChange|write failed/i,
	);
	assert.equal(entry.openDocs.get(uri)?.version, 1);
	assert.equal(entry.openDocs.get(uri)?.text, "first");
	assert.match(entry.lastError ?? "", /textDocument\/didChange/);
});
