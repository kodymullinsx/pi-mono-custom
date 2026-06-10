import { describe, expect, it, vi } from "vitest";
import { RpcClient } from "../src/modes/rpc/rpc-client.ts";

type RpcClientPrivate = {
	send: (command: { type: string }) => Promise<unknown>;
	getData: <T>(response: unknown) => T;
};

describe("RpcClient clone", () => {
	it("sends the clone RPC command", async () => {
		const client = new RpcClient();
		const privateClient = client as unknown as RpcClientPrivate;
		const send = vi.fn(async () => ({
			type: "response",
			command: "clone",
			success: true,
			data: { cancelled: false },
		}));
		privateClient.send = send;
		privateClient.getData = <T>(response: unknown): T => {
			return (response as { data: T }).data;
		};

		const result = await client.clone();

		expect(send).toHaveBeenCalledWith({ type: "clone" });
		expect(result).toEqual({ cancelled: false });
	});
});

describe("RpcClient attachments", () => {
	it("sends prompt attachments on the first-class attachment field", async () => {
		const client = new RpcClient();
		const privateClient = client as unknown as RpcClientPrivate;
		const send = vi.fn(async () => ({ type: "response", command: "prompt", success: true }));
		privateClient.send = send;

		const attachments = [
			{
				type: "document" as const,
				data: "JVBERi0xLjQK",
				mimeType: "application/pdf",
				name: "sample.pdf",
			},
		];

		await client.prompt("read this", attachments);

		expect(send).toHaveBeenCalledWith({ type: "prompt", message: "read this", attachments });
	});
});
