#!/usr/bin/env node

import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const textOnly = args.includes("--text");
const currentOnly = args.includes("--current");
const cleanedArgs = args.filter((arg) => arg !== "--text" && arg !== "--current");
const url = cleanedArgs[0];

const b = await Promise.race([
	puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	}),
	new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
]).catch((e) => {
	console.error("✗ Could not connect to browser:", e.message);
	console.error("  Run: browser-start.js");
	process.exit(1);
});

async function getTargetPage(browser) {
	const pages = await browser.pages();
	if (pages.length === 0) return null;

	const ranked = await Promise.all(
		pages.map(async (page, index) => {
			let score = 0;
			try {
				const state = await page.evaluate(() => ({
					visibilityState: document.visibilityState,
					hasFocus: document.hasFocus(),
				}));
				if (state.hasFocus) score += 4;
				if (state.visibilityState === "visible") score += 2;
			} catch {}

			const pageUrl = page.url();
			if (pageUrl && pageUrl !== "about:blank") score += 1;

			return { page, index, score };
		}),
	);

	ranked.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return b.index - a.index;
	});

	return ranked[0]?.page ?? null;
}

const p = await getTargetPage(b);

if (!p) {
	console.error("✗ No active tab found");
	process.exit(1);
}

if (url && !currentOnly) {
	try {
		await p.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
	} catch (error) {
		console.error(`✗ Failed to navigate to ${url}: ${error.message}`);
		await b.disconnect();
		process.exit(1);
	}
}

const finalUrl = p.url();
const title = await p.title();
const output = await p.evaluate((asText) => {
	if (asText) {
		return document.documentElement.innerText || document.body?.innerText || "";
	}
	return document.documentElement.outerHTML;
}, textOnly);

console.log(`URL: ${finalUrl}`);
if (title) console.log(`Title: ${title}`);
console.log("");
console.log(output);

await b.disconnect();
