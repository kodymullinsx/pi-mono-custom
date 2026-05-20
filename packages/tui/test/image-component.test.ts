import assert from "node:assert";
import { describe, it } from "node:test";
import { Image } from "../src/components/image.js";
import { visibleWidth } from "../src/utils.js";

describe("Image component", () => {
	it("clamps fallback text to narrow widths", () => {
		const previousTerm = process.env.TERM;
		delete process.env.TERM;

		try {
			const image = new Image(
				"not-an-image",
				"image/png",
				{ fallbackColor: (text) => text },
				{ filename: "very-long-image-name.png" },
				{ widthPx: 1200, heightPx: 800 },
			);

			const [line] = image.render(5);

			assert.ok(line);
			assert.ok(visibleWidth(line) <= 5);
		} finally {
			if (previousTerm === undefined) {
				delete process.env.TERM;
			} else {
				process.env.TERM = previousTerm;
			}
		}
	});

	it("does not invent dimensions for unreadable image payloads", () => {
		const previousTerm = process.env.TERM;
		delete process.env.TERM;

		try {
			const image = new Image("not-an-image", "image/png", { fallbackColor: (text) => text });

			const [line] = image.render(80);

			assert.ok(line);
			assert.match(line, /unknown dimensions/);
			assert.doesNotMatch(line, /800x600/);
		} finally {
			if (previousTerm === undefined) {
				delete process.env.TERM;
			} else {
				process.env.TERM = previousTerm;
			}
		}
	});
});
