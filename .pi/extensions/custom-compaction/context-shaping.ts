function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stableSerialize(value: unknown): string {
	return JSON.stringify(value);
}

export function isExtensionOwnedHiddenMessage(message: unknown, customTypePrefix: string): boolean {
	if (!isRecord(message)) return false;
	return (
		message.role === "custom" &&
		typeof message.customType === "string" &&
		message.customType.startsWith(customTypePrefix) &&
		message.display === false
	);
}

export function validateContextShapeChange(
	before: unknown[],
	after: unknown[],
	customTypePrefix: string,
): { valid: boolean; removedCount: number; reason?: string } {
	let beforeIndex = 0;
	let afterIndex = 0;
	let removedCount = 0;

	while (beforeIndex < before.length && afterIndex < after.length) {
		if (stableSerialize(before[beforeIndex]) === stableSerialize(after[afterIndex])) {
			beforeIndex += 1;
			afterIndex += 1;
			continue;
		}
		if (isExtensionOwnedHiddenMessage(before[beforeIndex], customTypePrefix)) {
			removedCount += 1;
			beforeIndex += 1;
			continue;
		}
		return {
			valid: false,
			removedCount,
			reason: `Unexpected context mutation at original index ${beforeIndex}`,
		};
	}

	while (beforeIndex < before.length) {
		if (!isExtensionOwnedHiddenMessage(before[beforeIndex], customTypePrefix)) {
			return {
				valid: false,
				removedCount,
				reason: `Unexpected trailing context mutation at original index ${beforeIndex}`,
			};
		}
		removedCount += 1;
		beforeIndex += 1;
	}

	if (afterIndex < after.length) {
		return {
			valid: false,
			removedCount,
			reason: `Context shaping introduced ${after.length - afterIndex} unexpected messages`,
		};
	}

	return { valid: true, removedCount };
}

export function shapeContextMessages<T>(messages: T[], customTypePrefix: string): T[] {
	const filtered = messages.filter((message) => !isExtensionOwnedHiddenMessage(message, customTypePrefix));
	if (filtered.length === messages.length) return messages;
	const validation = validateContextShapeChange(messages, filtered, customTypePrefix);
	return validation.valid ? filtered : messages;
}
