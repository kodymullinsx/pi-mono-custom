import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const brokerUrl =
  process.env.LOCAL_TOOL_BROKER_URL ?? "http://127.0.0.1:18440";
const tokenFile =
  process.env.LOCAL_TOOL_BROKER_TOKEN_FILE ??
  "/Users/kodymullins/Library/Application Support/local-tool-broker/tokens/pi";

function boundedSignal(timeoutMs, signal) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function callLocalToolResult(
  operation,
  args,
  timeoutMs = 60_000,
  options = {},
) {
  const token = readFileSync(tokenFile, "utf8").trim();
  const deadline = Date.now() + timeoutMs;
  options.notify?.(`Calling centralized ${operation} through the local gateway.`);
  let response = await fetch(new URL("/v1/calls", brokerUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      api_version: "1.0",
      request_id: randomUUID(),
      operation,
      arguments: args,
      timeout_ms: timeoutMs,
      wait_ms: Math.min(timeoutMs, 30_000),
    }),
    signal: boundedSignal(timeoutMs, options.signal),
  });
  let envelope = await response.json();
  while (
    response.status === 202 &&
    (envelope.state === "queued" || envelope.state === "running")
  ) {
    if (Date.now() >= deadline) {
      throw new Error("Local tool broker request timed out; execution status remains queryable");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    response = await fetch(
      new URL(`/v1/calls/${envelope.execution_id}`, brokerUrl),
      {
        headers: { authorization: `Bearer ${token}` },
        signal: boundedSignal(
          Math.max(1, deadline - Date.now()),
          options.signal,
        ),
      },
    );
    envelope = await response.json();
  }
  if (!response.ok || envelope.state !== "succeeded") {
    const code = envelope.error?.code ?? `HTTP_${response.status}`;
    throw new Error(`Local tool broker request failed: ${code}`);
  }
  return envelope.result;
}

export async function callLocalTool(operation, args, timeoutMs = 60_000) {
  const result = await callLocalToolResult(operation, args, timeoutMs);
  if (typeof result?.structuredContent?.result === "string") {
    return result.structuredContent.result;
  }
  const text = result?.content?.find((item) => item?.type === "text")?.text;
  if (typeof text === "string") return text;
  throw new Error("Local tool broker returned no textual result");
}
