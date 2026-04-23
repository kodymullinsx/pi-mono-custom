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

	it("includes pages and region metadata in read execution headers", () => {
		expect(templateJs).toMatch(/const pages = typeof args\.pages === 'string' \? args\.pages : undefined;/);
		expect(templateJs).toMatch(/pages=\$\{escapeHtml\(pages\)\}/);
		expect(templateJs).toMatch(
			/region=\$\{region\.left\},\$\{region\.top\},\$\{region\.width\}x\$\{region\.height\}/,
		);
	});
});
