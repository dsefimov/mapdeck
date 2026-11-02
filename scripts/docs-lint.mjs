/* global console, process */
/**
 * Documentation checks: no history wording outside CHANGELOG, backticked
 * repo paths must exist, every ADR carries a Status/Date line.
 * Run via `npm run docs:lint`; not wired into git hooks.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const files = [
    "README.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "AGENTS.md",
    ...readdirSync("docs", { recursive: true })
        .filter((f) => f.endsWith(".md"))
        .map((f) => join("docs", f)),
];

const banned = /\b(previously|no longer|used to|review sweep|reviews kept|is now|are now)\b/i;
let failed = false;

for (const f of files) {
    const text = readFileSync(f, "utf8");
    text.split("\n").forEach((line, i) => {
        // history belongs only in CHANGELOG
        if (f !== "CHANGELOG.md" && banned.test(line)) {
            console.error(`${f}:${i + 1}: history wording: ${line.trim()}`);
            failed = true;
        }
    });
    // backticked paths must exist
    for (const m of text.matchAll(/`((?:src|docs|tests|scripts)\/[^`\s*{}]+)`/g)) {
        if (!existsSync(m[1])) {
            console.error(`${f}: missing path ${m[1]}`);
            failed = true;
        }
    }
}
// every ADR has Status and Date
for (const f of files.filter((x) => /docs[\\/]adr[\\/]\d{4}/.test(x))) {
    if (!/^Status: .+ · Date: \d{4}-\d{2}-\d{2}/m.test(readFileSync(f, "utf8"))) {
        console.error(`${f}: missing "Status: … · Date: …" line`);
        failed = true;
    }
}
process.exit(failed ? 1 : 0);
