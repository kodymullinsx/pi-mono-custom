import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("export HTML document content rendering", () => {
	const templateJs = readFileSync(new URL("../src/core/export-html/template.js", import.meta.url), "utf-8");

	it("renders tool-result documents with a visible marker", () => {
		expect(templateJs).toMatch(/tool-documents/);
		expect(templateJs).toMatch(/document attached/);
	});

	it("renders user-message documents with a visible marker", () => {
		expect(templateJs).toMatch(/message-documents/);
		expect(templateJs).toMatch(/message-document/);
	});
});
