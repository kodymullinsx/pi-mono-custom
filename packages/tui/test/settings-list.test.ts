import assert from "node:assert";
import { describe, it } from "node:test";
import { SettingsList, type SettingsListTheme } from "../src/components/settings-list.js";

const testTheme: SettingsListTheme = {
	label: (text) => text,
	value: (text) => text,
	description: (text) => text,
	cursor: "> ",
	hint: (text) => text,
};

describe("SettingsList", () => {
	it("keeps spaces in search input so multi-word labels can be searched", () => {
		const list = new SettingsList(
			[{ id: "font-size", label: "Font Size", currentValue: "12", values: ["12", "14"] }],
			5,
			testTheme,
			() => {},
			() => {},
			{ enableSearch: true },
		);

		for (const char of "font size") {
			list.handleInput(char);
		}

		const rendered = list.render(80);
		assert.ok(rendered[0]?.includes("font size"));
		assert.ok(rendered.some((line) => line.includes("Font Size")));
	});

	it("keeps space as activation when search is empty", () => {
		let changed: string | undefined;
		const list = new SettingsList(
			[{ id: "theme", label: "Theme", currentValue: "dark", values: ["dark", "light"] }],
			5,
			testTheme,
			(id, value) => {
				changed = `${id}:${value}`;
			},
			() => {},
			{ enableSearch: true },
		);

		list.handleInput(" ");

		assert.strictEqual(changed, "theme:light");
	});
});
