import assert from "node:assert";
import { describe, it } from "node:test";
import { SelectList } from "../src/components/select-list.js";
import { visibleWidth } from "../src/utils.js";

const testTheme = {
	selectedPrefix: (text: string) => text,
	selectedText: (text: string) => text,
	description: (text: string) => text,
	scrollInfo: (text: string) => text,
	noMatch: (text: string) => text,
};

const visibleIndexOf = (line: string, text: string): number => {
	const index = line.indexOf(text);
	assert.notEqual(index, -1);
	return visibleWidth(line.slice(0, index));
};

describe("SelectList", () => {
	it("normalizes multiline descriptions to single line", () => {
		const items = [
			{
				value: "test",
				label: "test",
				description: "Line one\nLine two\nLine three",
			},
		];

		const list = new SelectList(items, 5, testTheme);
		const rendered = list.render(100);

		assert.ok(rendered.length > 0);
		assert.ok(!rendered[0].includes("\n"));
		assert.ok(rendered[0].includes("Line one Line two Line three"));
	});

	it("keeps descriptions aligned when the primary text is truncated", () => {
		const items = [
			{ value: "short", label: "short", description: "short description" },
			{
				value: "very-long-command-name-that-needs-truncation",
				label: "very-long-command-name-that-needs-truncation",
				description: "long description",
			},
		];

		const list = new SelectList(items, 5, testTheme);
		const rendered = list.render(80);

		assert.equal(visibleIndexOf(rendered[0], "short description"), visibleIndexOf(rendered[1], "long description"));
	});

	it("uses the configured minimum primary column width", () => {
		const items = [
			{ value: "a", label: "a", description: "first" },
			{ value: "bb", label: "bb", description: "second" },
		];

		const list = new SelectList(items, 5, testTheme, {
			minPrimaryColumnWidth: 12,
			maxPrimaryColumnWidth: 20,
		});
		const rendered = list.render(80);

		assert.equal(rendered[0].indexOf("first"), 14);
		assert.equal(rendered[1].indexOf("second"), 14);
	});

	it("uses the configured maximum primary column width", () => {
		const items = [
			{
				value: "very-long-command-name-that-needs-truncation",
				label: "very-long-command-name-that-needs-truncation",
				description: "first",
			},
			{ value: "short", label: "short", description: "second" },
		];

		const list = new SelectList(items, 5, testTheme, {
			minPrimaryColumnWidth: 12,
			maxPrimaryColumnWidth: 20,
		});
		const rendered = list.render(80);

		assert.equal(visibleIndexOf(rendered[0], "first"), 22);
		assert.equal(visibleIndexOf(rendered[1], "second"), 22);
	});

	it("allows overriding primary truncation while preserving description alignment", () => {
		const items = [
			{
				value: "very-long-command-name-that-needs-truncation",
				label: "very-long-command-name-that-needs-truncation",
				description: "first",
			},
			{ value: "short", label: "short", description: "second" },
		];

		const list = new SelectList(items, 5, testTheme, {
			minPrimaryColumnWidth: 12,
			maxPrimaryColumnWidth: 12,
			truncatePrimary: ({ text, maxWidth }) => {
				if (text.length <= maxWidth) {
					return text;
				}

				return `${text.slice(0, Math.max(0, maxWidth - 1))}…`;
			},
		});
		const rendered = list.render(80);

		assert.ok(rendered[0].includes("…"));
		assert.equal(visibleIndexOf(rendered[0], "first"), visibleIndexOf(rendered[1], "second"));
	});

	it("keeps selection stable when filtering removes all items", () => {
		const list = new SelectList([{ value: "alpha", label: "alpha" }], 5, testTheme);

		list.setFilter("zzz");
		list.setSelectedIndex(4);
		list.handleInput("\x1b[B"); // Down
		list.handleInput("\x1b[A"); // Up
		list.handleInput("\r"); // Enter

		assert.strictEqual(list.getSelectedItem(), null);
		assert.deepStrictEqual(list.render(80), ["  No matching commands"]);
	});

	it("clamps no-match output to narrow widths", () => {
		const list = new SelectList([{ value: "alpha", label: "alpha" }], 5, testTheme);

		list.setFilter("zzz");
		const [line] = list.render(1);

		assert.ok(line);
		assert.ok(visibleWidth(line) <= 1);
	});

	it("clamps item rows to narrow widths", () => {
		const list = new SelectList(
			[
				{ value: "alpha", label: "alpha" },
				{ value: "beta", label: "beta" },
			],
			5,
			testTheme,
		);

		list.setSelectedIndex(1);
		const rendered = list.render(1);

		assert.ok(rendered.length > 0);
		for (const line of rendered) {
			assert.ok(visibleWidth(line) <= 1);
		}
	});

	it("does not pass negative widths to custom primary truncation", () => {
		const seenWidths: Array<{ maxWidth: number; columnWidth: number }> = [];
		const list = new SelectList([{ value: "alpha", label: "alpha" }], 5, testTheme, {
			truncatePrimary: ({ maxWidth, columnWidth }) => {
				seenWidths.push({ maxWidth, columnWidth });
				assert.ok(maxWidth >= 0);
				assert.ok(columnWidth >= 0);
				return "";
			},
		});

		list.render(1);

		assert.deepStrictEqual(seenWidths, [{ maxWidth: 0, columnWidth: 0 }]);
	});
});
