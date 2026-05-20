import { describe, expect, it } from "vitest";
import { parseFinalToolCallJson, parseStreamingJson } from "../src/utils/json-parse.js";

describe("json parsing helpers", () => {
	it("keeps streaming tool-call parsing tolerant for partial deltas", () => {
		expect(parseStreamingJson('{"path":')).toEqual({});
	});

	it("throws on incomplete final tool-call JSON instead of silently returning an empty object", () => {
		expect(() => parseFinalToolCallJson('{"path":')).toThrow();
	});

	it("still repairs safe malformed string literals for final tool-call JSON", () => {
		expect(parseFinalToolCallJson('{"path":"a\nb"}')).toEqual({ path: "a\nb" });
	});
});
