#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(__dirname, "..");

function printUsage() {
	console.error(`Usage:
  node scripts/capture-provider-payload.mjs compare --capture-dir <dir> --baseline-run <name> --candidate-run <name> [--prefix <custom-type-prefix>]
  node scripts/capture-provider-payload.mjs compare --baseline-dir <dir> --candidate-dir <dir> [--prefix <custom-type-prefix>] [--history-only]

Notes:
  - Payload capture files are written by the extension when PI_CUSTOM_COMPACTION_CAPTURE_DIR is set.
  - Keep PI_CUSTOM_COMPACTION_ENABLE_CONTEXT_SHAPING unset or false for the baseline run.
  - By default, compare fails closed on any canonicalized full-payload difference.
  - Use --history-only only for diagnostics when you explicitly want the filtered history check without treating full-payload drift as a blocker.`);
}

function readFlag(args, name) {
	const index = args.indexOf(name);
	if (index === -1) return undefined;
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`Missing value for ${name}`);
	}
	return value;
}

function getGlobalPiRoot() {
	const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
	return path.join(globalRoot, "@mariozechner", "pi-coding-agent");
}

function assertSafeRunName(runName, flagName) {
	if (runName.includes("/") || runName.includes("\\") || runName === "." || runName === "..") {
		throw new Error(`${flagName} must be a simple run label, not a path`);
	}
}

async function loadPayloadCaptureModule() {
	const piRoot = getGlobalPiRoot();
	const jitiPath = pathToFileURL(
		path.join(piRoot, "node_modules", "@mariozechner", "jiti", "lib", "jiti.mjs"),
	).href;
	const { default: createJiti } = await import(jitiPath);
	const jiti = createJiti(import.meta.url, { moduleCache: false });
	return jiti.import(path.join(extensionRoot, "payload-capture.ts"));
}

function resolveRunDirectory(args, which) {
	const explicitDir = readFlag(args, `--${which}-dir`);
	if (explicitDir) return path.resolve(explicitDir);

	const captureDir = readFlag(args, "--capture-dir");
	const runName = readFlag(args, `--${which}-run`);
	if (!captureDir || !runName) {
		throw new Error(`Provide either --${which}-dir or both --capture-dir and --${which}-run`);
	}
	assertSafeRunName(runName, `--${which}-run`);
	return path.resolve(captureDir, runName);
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
		printUsage();
		process.exit(args.length === 0 ? 1 : 0);
	}

	const command = args[0];
	if (command !== "compare") {
		printUsage();
		throw new Error(`Unknown command: ${command}`);
	}

	const baselineDir = resolveRunDirectory(args, "baseline");
	const candidateDir = resolveRunDirectory(args, "candidate");
	const customTypePrefix = readFlag(args, "--prefix") ?? "custom-compaction/";
	const historyOnly = args.includes("--history-only");
	const { comparePayloadCaptureDirectories } = await loadPayloadCaptureModule();
	const result = await comparePayloadCaptureDirectories(baselineDir, candidateDir, customTypePrefix);
	const fullPayloadMatches = result.payloadDifferences.length === 0;

	console.log(`Compared ${result.filesCompared} capture file(s).`);
	console.log(`Baseline:  ${baselineDir}`);
	console.log(`Candidate: ${candidateDir}`);

	if (result.mismatches.length === 0) {
		console.log("Context/history diff check: OK");
	} else {
		console.error("Context/history diff check: FAILED");
		for (const mismatch of result.mismatches) {
			console.error(`- ${mismatch}`);
		}
	}

	if (result.payloadDifferences.length > 0) {
		const prefix = historyOnly ? "Canonicalized full payload differences still exist:" : "Canonicalized full payload differences are a release blocker:";
		console.error(`${prefix}`);
		for (const payloadDifference of result.payloadDifferences) {
			console.error(`- ${payloadDifference}`);
		}
		if (!historyOnly) {
			console.error("Re-run with --history-only only if you intentionally want a diagnostic subset check rather than the default strict gate.");
		}
	} else {
		console.log("Canonicalized full payloads are identical.");
	}

	process.exit(result.ok && (historyOnly || fullPayloadMatches) ? 0 : 1);
}

await main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
});
