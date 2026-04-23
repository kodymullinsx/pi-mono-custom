import fs from "node:fs/promises";
import path from "node:path";

export interface PayloadCaptureArtifact {
	schemaVersion: 1;
	sessionId?: string;
	sessionFile?: string;
	runLabel: string;
	sequence: number;
	capturedAt: string;
	contextMessages: unknown[];
	payloadMessages?: unknown[];
	payload: unknown;
}

const PAYLOAD_VOLATILE_KEYS = new Set([
	"authorization",
	"api-key",
	"x-api-key",
	"request-id",
	"request_id",
	"x-request-id",
	"traceparent",
	"tracestate",
]);
const MESSAGE_VOLATILE_KEYS = new Set(["timestamp", "usage"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalizeInner(value: unknown, volatileKeys: Set<string>): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => canonicalizeInner(item, volatileKeys));
	}
	if (!isRecord(value)) return value;
	const normalized: Record<string, unknown> = {};
	for (const key of Object.keys(value).sort()) {
		if (volatileKeys.has(key.toLowerCase())) continue;
		normalized[key] = canonicalizeInner(value[key], volatileKeys);
	}
	return normalized;
}

export function canonicalizePayload(value: unknown): unknown {
	return canonicalizeInner(value, PAYLOAD_VOLATILE_KEYS);
}

export function normalizeContextMessages(messages: unknown[]): unknown[] {
	return messages.map((message) => canonicalizeInner(message, MESSAGE_VOLATILE_KEYS));
}

function looksLikeMessageArray(value: unknown): value is unknown[] {
	return Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.role === "string");
}

export function extractPrimaryMessagesFromPayload(payload: unknown): unknown[] | undefined {
	if (isRecord(payload) && looksLikeMessageArray(payload.messages)) return payload.messages;
	if (looksLikeMessageArray(payload)) return payload;

	const seen = new Set<unknown>();
	const matches: unknown[][] = [];

	function walk(node: unknown): void {
		if (seen.has(node)) return;
		if (isRecord(node) || Array.isArray(node)) seen.add(node);

		if (isRecord(node) && looksLikeMessageArray(node.messages)) {
			matches.push(node.messages);
		}

		if (Array.isArray(node)) {
			for (const item of node) {
				walk(item);
			}
			return;
		}

		if (!isRecord(node)) return;
		for (const key of Object.keys(node)) {
			walk(node[key]);
		}
	}

	walk(payload);
	if (matches.length === 0) return undefined;

	const canonicalMatches = matches.map((candidate) => JSON.stringify(candidate.map((message) => canonicalizePayload(message))));
	return canonicalMatches.every((candidate) => candidate === canonicalMatches[0]) ? matches[0] : undefined;
}

export function sanitizeRunLabel(runLabel: string): string {
	const flattened = runLabel.trim().replace(/[\\/]+/g, "-");
	const safe = flattened
		.replace(/[^a-zA-Z0-9._-]+/g, "-")
		.replace(/\.{2,}/g, ".")
		.replace(/^-+|-+$/g, "")
		.replace(/^\.+|\.+$/g, "");
	return safe || "capture";
}

export async function writePayloadCaptureArtifact(input: {
	outputDir: string;
	runLabel: string;
	sequence: number;
	sessionId?: string;
	sessionFile?: string;
	contextMessages: unknown[];
	payload: unknown;
}): Promise<string> {
	const captureDir = path.join(input.outputDir, sanitizeRunLabel(input.runLabel));
	await fs.mkdir(captureDir, { recursive: true });
	const artifact: PayloadCaptureArtifact = {
		schemaVersion: 1,
		sessionId: input.sessionId,
		sessionFile: input.sessionFile,
		runLabel: sanitizeRunLabel(input.runLabel),
		sequence: input.sequence,
		capturedAt: new Date().toISOString(),
		contextMessages: normalizeContextMessages(input.contextMessages),
		payloadMessages: extractPrimaryMessagesFromPayload(input.payload)?.map((message) => canonicalizePayload(message)),
		payload: canonicalizePayload(input.payload),
	};
	const filePath = path.join(captureDir, `${String(input.sequence).padStart(4, "0")}.json`);
	await fs.writeFile(filePath, JSON.stringify(artifact, null, 2));
	return filePath;
}

export async function readPayloadCaptureArtifact(filePath: string): Promise<PayloadCaptureArtifact> {
	return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function stableEqual(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

function isExtensionOwnedContextMessage(message: unknown, customTypePrefix: string): boolean {
	return (
		isRecord(message) &&
		message.role === "custom" &&
		typeof message.customType === "string" &&
		message.customType.startsWith(customTypePrefix) &&
		message.display === false
	);
}

function normalizeCustomMessageContent(content: unknown): unknown[] | undefined {
	if (typeof content === "string") {
		return [{ type: "text", text: content }];
	}
	if (Array.isArray(content)) {
		return content.map((item) => canonicalizePayload(item));
	}
	return undefined;
}

function convertExtensionContextMessageToPayloadMessage(message: unknown): unknown | undefined {
	if (!isRecord(message) || message.role !== "custom") return undefined;
	const content = normalizeCustomMessageContent(message.content);
	if (!content) return undefined;
	return canonicalizePayload({
		role: "user",
		content,
	});
}

function filterAllowedPayloadMessages(messages: unknown[], allowedMessages: unknown[]): unknown[] {
	if (allowedMessages.length === 0) return messages;
	const remaining = new Map<string, number>();
	for (const message of allowedMessages) {
		const key = JSON.stringify(canonicalizePayload(message));
		remaining.set(key, (remaining.get(key) ?? 0) + 1);
	}

	const filtered: unknown[] = [];
	for (const message of messages) {
		const key = JSON.stringify(canonicalizePayload(message));
		const count = remaining.get(key) ?? 0;
		if (count > 0) {
			remaining.set(key, count - 1);
			continue;
		}
		filtered.push(message);
	}
	return filtered;
}

function collectAllowedPayloadMessageRemovals(
	baselineContextMessages: unknown[],
	candidateContextMessages: unknown[],
	customTypePrefix: string,
): unknown[] {
	return [...baselineContextMessages, ...candidateContextMessages]
		.filter((message) => isExtensionOwnedContextMessage(message, customTypePrefix))
		.map((message) => convertExtensionContextMessageToPayloadMessage(message))
		.filter((message): message is unknown => message !== undefined);
}

export function comparePayloadCaptureArtifacts(
	baseline: PayloadCaptureArtifact,
	candidate: PayloadCaptureArtifact,
	customTypePrefix: string,
): { ok: boolean; mismatches: string[]; payloadEquivalent: boolean } {
	const mismatches: string[] = [];
	const baselineContext = baseline.contextMessages.filter((message) => !isExtensionOwnedContextMessage(message, customTypePrefix));
	const candidateContext = candidate.contextMessages.filter((message) => !isExtensionOwnedContextMessage(message, customTypePrefix));
	const allowedPayloadMessageRemovals = collectAllowedPayloadMessageRemovals(
		baseline.contextMessages,
		candidate.contextMessages,
		customTypePrefix,
	);

	if (!stableEqual(baselineContext, candidateContext)) {
		mismatches.push("context message snapshot differs outside the extension-owned custom-message subset");
	}

	if ((baseline.payloadMessages?.length ?? 0) > 0 || (candidate.payloadMessages?.length ?? 0) > 0) {
		const filteredBaselinePayloadMessages = filterAllowedPayloadMessages(
			baseline.payloadMessages ?? [],
			allowedPayloadMessageRemovals,
		);
		const filteredCandidatePayloadMessages = filterAllowedPayloadMessages(
			candidate.payloadMessages ?? [],
			allowedPayloadMessageRemovals,
		);
		if (!stableEqual(filteredBaselinePayloadMessages, filteredCandidatePayloadMessages)) {
			mismatches.push("provider payload messages differ");
		}
	}

	const payloadEquivalent = stableEqual(baseline.payload, candidate.payload);
	return {
		ok: mismatches.length === 0,
		mismatches,
		payloadEquivalent,
	};
}

export async function comparePayloadCaptureDirectories(
	baselineDir: string,
	candidateDir: string,
	customTypePrefix: string,
): Promise<{ ok: boolean; filesCompared: number; mismatches: string[]; payloadDifferences: string[] }> {
	const baselineFiles = (await fs.readdir(baselineDir)).filter((file) => file.endsWith(".json")).sort();
	const candidateFiles = (await fs.readdir(candidateDir)).filter((file) => file.endsWith(".json")).sort();
	const mismatches: string[] = [];
	const payloadDifferences: string[] = [];

	if (!stableEqual(baselineFiles, candidateFiles)) {
		mismatches.push("capture directories do not contain the same JSON files");
		return { ok: false, filesCompared: 0, mismatches, payloadDifferences };
	}

	for (const fileName of baselineFiles) {
		const baseline = await readPayloadCaptureArtifact(path.join(baselineDir, fileName));
		const candidate = await readPayloadCaptureArtifact(path.join(candidateDir, fileName));
		const comparison = comparePayloadCaptureArtifacts(baseline, candidate, customTypePrefix);
		if (!comparison.ok) {
			for (const mismatch of comparison.mismatches) {
				mismatches.push(`${fileName}: ${mismatch}`);
			}
		}
		if (!comparison.payloadEquivalent) {
			payloadDifferences.push(`${fileName}: canonicalized full payload differs`);
		}
	}

	return {
		ok: mismatches.length === 0,
		filesCompared: baselineFiles.length,
		mismatches,
		payloadDifferences,
	};
}
