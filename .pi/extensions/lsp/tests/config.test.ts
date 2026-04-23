import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig } from "../config.ts";

async function withTempDir<T>(fn: (root: string) => Promise<T>): Promise<T> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "pi-lsp-config-"));
	try {
		return await fn(root);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
}

function createConfig(command: string) {
	return JSON.stringify(
		{
			servers: {
				typescript: {
					command,
					args: ["--stdio"],
					extensions: [".ts", ".tsx"],
					languageId: "typescript",
				},
			},
		},
		null,
		2,
	);
}

test("project config takes precedence over global config", async () => {
	await withTempDir(async (root) => {
		const projectDir = path.join(root, "project");
		const agentDir = path.join(root, "agent");
		await fs.mkdir(path.join(projectDir, ".pi"), { recursive: true });
		await fs.mkdir(agentDir, { recursive: true });

		await fs.writeFile(path.join(projectDir, ".pi", "lsp.json"), createConfig("project-language-server"));
		await fs.writeFile(path.join(agentDir, "lsp.json"), createConfig("global-language-server"));

		const result = await loadConfig(projectDir, { agentDir });
		assert.ok(result.loaded);
		assert.equal(result.loaded.sourceKind, "project");
		assert.equal(result.loaded.config.servers.typescript.command, "project-language-server");
	});
});

test("invalid project config is rejected without silently falling back to global", async () => {
	await withTempDir(async (root) => {
		const projectDir = path.join(root, "project");
		const agentDir = path.join(root, "agent");
		await fs.mkdir(path.join(projectDir, ".pi"), { recursive: true });
		await fs.mkdir(agentDir, { recursive: true });

		await fs.writeFile(
			path.join(projectDir, ".pi", "lsp.json"),
			JSON.stringify({
				servers: {
					typescript: {
						args: ["--stdio"],
						extensions: [".ts"],
						languageId: "typescript",
					},
				},
			}),
		);
		await fs.writeFile(path.join(agentDir, "lsp.json"), createConfig("global-language-server"));

		const result = await loadConfig(projectDir, { agentDir });
		assert.equal(result.loaded, undefined);
		assert.match(result.error ?? "", /servers\.typescript\.command/);
	});
});

test("missing config files returns a clean no-config result", async () => {
	await withTempDir(async (root) => {
		const projectDir = path.join(root, "project");
		const agentDir = path.join(root, "agent");
		await fs.mkdir(projectDir, { recursive: true });
		await fs.mkdir(agentDir, { recursive: true });

		const result = await loadConfig(projectDir, { agentDir });
		assert.equal(result.loaded, undefined);
		assert.equal(result.error, undefined);
		assert.equal(result.checkedPaths.length, 2);
	});
});

test("project config path access errors are surfaced instead of treated as missing", async () => {
	await withTempDir(async (root) => {
		const projectDir = path.join(root, "project");
		const agentDir = path.join(root, "agent");
		await fs.mkdir(projectDir, { recursive: true });
		await fs.mkdir(agentDir, { recursive: true });
		await fs.writeFile(path.join(projectDir, ".pi"), "not-a-directory");

		const result = await loadConfig(projectDir, { agentDir });
		assert.equal(result.loaded, undefined);
		assert.match(result.error ?? "", /Cannot access LSP config path/);
		assert.match(result.error ?? "", /ENOTDIR|not a directory/i);
	});
});
