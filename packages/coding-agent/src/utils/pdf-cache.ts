import { createHash } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { getAgentDir } from "../config.js";

let pdfCacheRootReady = false;
let activeCleanup: Promise<void> | undefined;
let lastCleanupMs = 0;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

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

function pruneStaleEntries(root: string): Promise<void> {
	const now = Date.now();
	if (now - lastCleanupMs < CLEANUP_INTERVAL_MS) return Promise.resolve();
	if (activeCleanup) return activeCleanup;

	lastCleanupMs = now;
	activeCleanup = (async () => {
		try {
			const entries = await readdir(root);
			const removals = entries.map(async (entry) => {
				const entryPath = join(root, entry);
				try {
					const stats = await stat(entryPath);
					if (stats.isDirectory() && now - stats.mtimeMs > CACHE_TTL_MS) {
						await rm(entryPath, { recursive: true, force: true });
					}
				} catch {
					// Entry vanished or inaccessible
				}
			});
			await Promise.all(removals);
		} catch {
			// Root unreadable
		} finally {
			activeCleanup = undefined;
		}
	})();
	return activeCleanup;
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

	pruneStaleEntries(root).catch(() => {});

	const outputDir = join(root, buildPDFCacheKey(filePath, mtimeMs, options));
	await mkdir(outputDir, { recursive: true });

	const entries = await readdir(outputDir);
	const imagePaths = entries
		.filter((entry) => entry.endsWith(".jpg"))
		.sort()
		.map((entry) => join(outputDir, entry));

	return { outputDir, imagePaths };
}
