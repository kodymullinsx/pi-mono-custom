import fs from "node:fs/promises";
import path from "node:path";

function pathInside(root: string, candidate: string): boolean {
	const resolvedRoot = path.resolve(root);
	const resolvedCandidate = path.resolve(candidate);
	const relative = path.relative(resolvedRoot, resolvedCandidate);
	return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/**
 * Resolve a file beneath an independently trusted anchor without accepting
 * symlinks in any descendant parent directory. The returned canonical path is
 * safe to open with O_NOFOLLOW for leaf-symlink and replacement protection.
 */
export async function resolveTrustedFilePath(anchorRoot: string, expectedRoot: string, candidatePath: string): Promise<string> {
	const anchor = path.resolve(anchorRoot);
	const expected = path.resolve(expectedRoot);
	const candidate = path.resolve(candidatePath);
	if (!pathInside(anchor, expected) || !pathInside(expected, candidate)) {
		throw new Error(`File path ${candidatePath} is outside its trusted root.`);
	}

	const relative = path.relative(anchor, candidate);
	const parentComponents = relative.split(path.sep).filter(Boolean).slice(0, -1);
	let current = anchor;
	for (const component of parentComponents) {
		current = path.join(current, component);
		const stat = await fs.lstat(current);
		if (stat.isSymbolicLink()) throw new Error(`File path ${candidatePath} has a symlink parent directory.`);
		if (!stat.isDirectory()) throw new Error(`File path ${candidatePath} has a non-directory parent component.`);
	}
	const candidateStat = await fs.lstat(candidate);
	if (candidateStat.isSymbolicLink()) throw new Error(`File path ${candidatePath} is a symlink.`);

	const [canonicalAnchor, canonicalExpected, canonicalCandidate] = await Promise.all([
		fs.realpath(anchor),
		fs.realpath(expected),
		fs.realpath(candidate),
	]);
	if (!pathInside(canonicalAnchor, canonicalExpected) || !pathInside(canonicalExpected, canonicalCandidate)) {
		throw new Error(`Resolved file path ${canonicalCandidate} is outside its trusted root.`);
	}
	return canonicalCandidate;
}
