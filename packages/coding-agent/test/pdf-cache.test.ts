import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configMock = vi.hoisted(() => ({
	agentDir: "",
}));

vi.mock("../src/config.js", () => ({
	getAgentDir: () => configMock.agentDir,
}));

import { getPDFCacheEntry } from "../src/utils/pdf-cache.ts";

describe("PDF cache", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "pi-pdf-cache-"));
		configMock.agentDir = tempDir;
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns cached page images in numeric page order", async () => {
		const cacheEntry = await getPDFCacheEntry("/tmp/source.pdf", 123, { firstPage: 1, lastPage: 10 });
		mkdirSync(cacheEntry.outputDir, { recursive: true });
		for (const page of [1, 10, 2]) {
			writeFileSync(join(cacheEntry.outputDir, `page-${page}.jpg`), `page-${page}`);
		}

		const reloaded = await getPDFCacheEntry("/tmp/source.pdf", 123, { firstPage: 1, lastPage: 10 });

		expect(reloaded.imagePaths.map((path) => basename(path))).toEqual(["page-1.jpg", "page-2.jpg", "page-10.jpg"]);
	});
});
