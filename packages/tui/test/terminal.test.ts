import assert from "node:assert";
import { describe, it } from "node:test";
import { ProcessTerminal, type Terminal } from "../src/terminal.js";

describe("ProcessTerminal dimensions", () => {
	it("falls back to COLUMNS and LINES before default dimensions", () => {
		const previousColumnsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "columns");
		const previousRowsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "rows");
		const previousColumns = process.env.COLUMNS;
		const previousLines = process.env.LINES;

		try {
			Object.defineProperty(process.stdout, "columns", { value: undefined, configurable: true });
			Object.defineProperty(process.stdout, "rows", { value: undefined, configurable: true });
			process.env.COLUMNS = "123";
			process.env.LINES = "45";

			const terminal = new ProcessTerminal();

			assert.equal(terminal.columns, 123);
			assert.equal(terminal.rows, 45);
		} finally {
			if (previousColumnsDescriptor) {
				Object.defineProperty(process.stdout, "columns", previousColumnsDescriptor);
			} else {
				Reflect.deleteProperty(process.stdout, "columns");
			}
			if (previousRowsDescriptor) {
				Object.defineProperty(process.stdout, "rows", previousRowsDescriptor);
			} else {
				Reflect.deleteProperty(process.stdout, "rows");
			}
			if (previousColumns === undefined) {
				delete process.env.COLUMNS;
			} else {
				process.env.COLUMNS = previousColumns;
			}
			if (previousLines === undefined) {
				delete process.env.LINES;
			} else {
				process.env.LINES = previousLines;
			}
		}
	});

	it("does not enable modifyOtherKeys after stop clears the fallback timer", async () => {
		const terminal = new ProcessTerminal();
		const writes: string[] = [];
		const previousWrite = process.stdout.write;
		const previousKill = process.kill;

		(process.stdout as any).write = (chunk: unknown) => {
			writes.push(String(chunk));
			return true;
		};
		(process as any).kill = () => true;

		try {
			terminal.start(
				() => {},
				() => {},
			);
			terminal.stop();
			writes.length = 0;

			await new Promise((resolve) => setTimeout(resolve, 200));

			assert.equal(writes.includes("\x1b[>4;2m"), false);
		} finally {
			try {
				terminal.stop();
			} finally {
				(process.stdout as any).write = previousWrite;
				(process as any).kill = previousKill;
			}
		}
	});

	it("exposes Windows VT input setup status through the terminal contract", () => {
		const terminal: Terminal = new ProcessTerminal();

		assert.equal(terminal.windowsVTInputStatus, "not_attempted");
	});

	it("continues critical cleanup when a stop write fails", () => {
		const terminal = new ProcessTerminal();
		const previousWrite = process.stdout.write;
		const previousKill = process.kill;
		const previousSetRawMode = process.stdin.setRawMode;
		const previousPause = process.stdin.pause;
		const previousResume = process.stdin.resume;
		const previousIsRawDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isRaw");
		const stdinDataListenersBefore = process.stdin.listenerCount("data");
		const stdoutResizeListenersBefore = process.stdout.listenerCount("resize");
		const rawModeCalls: boolean[] = [];
		let pauseCount = 0;

		(process.stdout as any).write = () => true;
		(process as any).kill = () => true;
		Object.defineProperty(process.stdin, "isRaw", { value: false, configurable: true });
		(process.stdin as any).setRawMode = (value: boolean) => {
			rawModeCalls.push(value);
			return process.stdin;
		};
		(process.stdin as any).pause = () => {
			pauseCount += 1;
			return process.stdin;
		};
		(process.stdin as any).resume = () => process.stdin;

		try {
			terminal.start(
				() => {},
				() => {},
			);
			(process.stdout as any).write = () => {
				throw new Error("write failed");
			};

			assert.throws(() => terminal.stop(), /write failed/);
			assert.equal(process.stdin.listenerCount("data"), stdinDataListenersBefore);
			assert.equal(process.stdout.listenerCount("resize"), stdoutResizeListenersBefore);
			assert.deepStrictEqual(rawModeCalls, [true, false]);
			assert.equal(pauseCount, 1);
		} finally {
			(process.stdout as any).write = () => true;
			try {
				terminal.stop();
			} catch {}
			(process.stdout as any).write = previousWrite;
			(process as any).kill = previousKill;
			(process.stdin as any).setRawMode = previousSetRawMode;
			(process.stdin as any).pause = previousPause;
			(process.stdin as any).resume = previousResume;
			if (previousIsRawDescriptor) {
				Object.defineProperty(process.stdin, "isRaw", previousIsRawDescriptor);
			} else {
				Reflect.deleteProperty(process.stdin, "isRaw");
			}
		}
	});
});
