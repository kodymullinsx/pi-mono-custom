import { createHash } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { getAgentDir } from "../config.js";

let pdfCacheRootReady = false;

function getPDFCacheRoot(): string {
	return join(getAgentDir(), "cache", "pdf");
}

function buildPDFCacheKey(
	filePath: string,
	mtimeMs: number,
	options?: { firstPage?: number; lastPage?: number },
): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				filePath,
				fileName: basename(filePath),
				mtimeMs,
				firstPage: options?.firstPage ?? null,
				lastPage: options?.lastPage ?? null,
			}),
		)
		.digest("hex");
}

export async function getPDFCacheEntry(
	filePath: string,
	mtimeMs: number,
	options?: { firstPage?: number; lastPage?: number },
): Promise<{ outputDir: string; imagePaths: string[] }> {
	const root = getPDFCacheRoot();
	if (!pdfCacheRootReady) {
		await mkdir(root, { recursive: true });
		pdfCacheRootReady = true;
	}
	const outputDir = join(root, buildPDFCacheKey(filePath, mtimeMs, options));
	await mkdir(outputDir, { recursive: true });

	const entries = await readdir(outputDir);
	const imagePaths = entries
		.filter((entry) => entry.endsWith(".jpg"))
		.sort()
		.map((entry) => join(outputDir, entry));

	return { outputDir, imagePaths };
}
