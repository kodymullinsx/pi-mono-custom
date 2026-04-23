import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	analyzeDocumentSymbols,
	analyzeHover,
	analyzeLocations,
	normalizeDocumentSymbols,
	normalizeHover,
	normalizeLocations,
	renderDocumentSymbolResult,
	renderHoverResult,
	renderLocationResult,
} from "../format.ts";

test("normalizeLocations handles Location and LocationLink responses", () => {
	const result = normalizeLocations([
		{
			uri: "file:///tmp/example.ts",
			range: {
				start: { line: 1, character: 2 },
				end: { line: 1, character: 6 },
			},
		},
		{
			targetUri: "file:///tmp/linked.ts",
			targetSelectionRange: {
				start: { line: 4, character: 0 },
				end: { line: 4, character: 8 },
			},
		},
	]);

	assert.deepEqual(result, [
		{
			uri: "file:///tmp/example.ts",
			path: "/tmp/example.ts",
			line: 2,
			column: 3,
			endLine: 2,
			endColumn: 7,
		},
		{
			uri: "file:///tmp/linked.ts",
			path: "/tmp/linked.ts",
			line: 5,
			column: 1,
			endLine: 5,
			endColumn: 9,
		},
	]);
});

test("normalizeHover supports string, marked string arrays, and malformed payloads", () => {
	assert.equal(normalizeHover({ contents: "Plain hover text" }), "Plain hover text");
	assert.equal(
		normalizeHover({
			contents: [
				{ language: "ts", value: "const value = 1;" },
				"Extra docs",
			],
		}),
		"```ts\nconst value = 1;\n```\n\nExtra docs",
	);
	assert.equal(normalizeHover({ contents: { unexpected: true } }), null);
	assert.equal(normalizeHover({}), null);
});

test("normalizeDocumentSymbols handles hierarchical and flat symbol payloads", () => {
	const hierarchical = normalizeDocumentSymbols([
		{
			name: "ExampleClass",
			kind: 5,
			range: {
				start: { line: 0, character: 0 },
				end: { line: 10, character: 1 },
			},
			selectionRange: {
				start: { line: 0, character: 6 },
				end: { line: 0, character: 18 },
			},
			children: [
				{
					name: "run",
					kind: 6,
					range: {
						start: { line: 2, character: 1 },
						end: { line: 4, character: 2 },
					},
					selectionRange: {
						start: { line: 2, character: 1 },
						end: { line: 2, character: 4 },
					},
				},
			],
		},
	]);
	assert.equal(hierarchical.length, 1);
	assert.equal(hierarchical[0].children.length, 1);
	assert.equal(hierarchical[0].kindName, "Class");
	assert.equal(hierarchical[0].children[0].kindName, "Method");

	const flat = normalizeDocumentSymbols([
		{
			name: "standalone",
			kind: 12,
			containerName: "utils",
			location: {
				uri: "file:///tmp/utils.ts",
				range: {
					start: { line: 7, character: 0 },
					end: { line: 8, character: 0 },
				},
			},
		},
	]);
	assert.equal(flat.length, 1);
	assert.equal(flat[0].containerName, "utils");
	assert.equal(flat[0].kindName, "Function");
	assert.deepEqual(flat[0].children, []);
});

test("renderLocationResult surfaces preview read failures", async () => {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-lsp-preview-"));
	const readablePath = path.join(tempRoot, "exists.ts");
	const unreadablePath = path.join(tempRoot, "missing.ts");
	await fs.writeFile(readablePath, "first\nsecond\n");

	const result = await renderLocationResult({
		operation: "goToDefinition",
		language: "typescript",
		sourcePath: readablePath,
		locations: [
			{
				uri: `file://${readablePath}`,
				path: readablePath,
				line: 1,
				column: 1,
				endLine: 1,
				endColumn: 5,
			},
			{
				uri: `file://${unreadablePath}`,
				path: unreadablePath,
				line: 1,
				column: 1,
				endLine: 1,
				endColumn: 5,
			},
		],
	});

	assert.equal(result.details.previewReadFailures, 1);
	assert.equal(result.details.locations[0].preview, "first");
	assert.equal(result.details.locations[1].preview, undefined);
	assert.match(result.text, /Unable to read preview text for 1 location\(s\)\./);

	await fs.rm(tempRoot, { recursive: true, force: true });
});

test("analyzeLocations reports malformed payloads that would otherwise look empty", () => {
	const result = analyzeLocations([
		{
			uri: "file:///tmp/example.ts",
			range: { start: { line: 1 }, end: { line: 1, character: 4 } },
		},
	]);

	assert.equal(result.items.length, 0);
	assert.equal(result.malformedCount, 1);
	assert.equal(result.unsupportedResponse, true);
});

test("renderHoverResult warns when hover contents are malformed", () => {
	const result = renderHoverResult({
		operation: "hover",
		language: "typescript",
		sourcePath: "/tmp/example.ts",
		rawResult: { contents: { unexpected: true } },
	});

	assert.equal(result.details.unsupportedResponse, true);
	assert.equal(result.details.malformedResultCount, 1);
	assert.match(result.text, /unsupported hover response/i);
	assert.match(result.text, /malformed hover content item/i);
});

test("analyzeHover preserves valid content while flagging malformed items", () => {
	const result = analyzeHover({
		contents: [{ language: "ts", value: "const value = 1;" }, { nope: true }],
	});

	assert.equal(result.contents, "```ts\nconst value = 1;\n```");
	assert.equal(result.malformedCount, 1);
	assert.equal(result.unsupportedResponse, false);
});

test("renderDocumentSymbolResult warns when symbol payloads are malformed", () => {
	const result = renderDocumentSymbolResult({
		operation: "documentSymbol",
		language: "typescript",
		sourcePath: "/tmp/example.ts",
		rawResult: [{ name: "BrokenSymbol", kind: 12 }],
	});

	assert.equal(result.details.unsupportedResponse, true);
	assert.equal(result.details.malformedResultCount, 1);
	assert.match(result.text, /unsupported document symbol response/i);
	assert.match(result.text, /malformed document symbol/i);
});

test("analyzeDocumentSymbols preserves valid symbols while counting malformed entries", () => {
	const result = analyzeDocumentSymbols([
		{
			name: "standalone",
			kind: 12,
			location: {
				uri: "file:///tmp/utils.ts",
				range: {
					start: { line: 7, character: 0 },
					end: { line: 8, character: 0 },
				},
			},
		},
		{ name: "broken", kind: 12 },
	]);

	assert.equal(result.items.length, 1);
	assert.equal(result.malformedCount, 1);
	assert.equal(result.unsupportedResponse, false);
});
