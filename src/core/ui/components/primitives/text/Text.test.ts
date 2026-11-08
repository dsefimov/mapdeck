import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { TextTone, TextVariant, TextWeight } from "./Text";

/**
 * Tone/variant/weight values index the styles object as-is
 * (`styles[tone]`), so every value must have a same-named class in the
 * CSS module — a tone without a rule renders with no styling at all.
 */

// Not a `?raw` import: vitest's disabled CSS pipeline mangles those to "".
const css = readFileSync(join(__dirname, "Text.module.css"), "utf8");

const hasClass = (name: string): boolean =>
    new RegExp(`^\\.${name}\\s*\\{`, "m").test(css);

describe("Text variant classes", () => {
    it.each([
        ...(["title", "body", "hint", "caption"] as const satisfies readonly TextVariant[]),
        ...(["secondary", "muted", "accent", "error", "on-accent"] as const satisfies readonly TextTone[]),
        ...(["semibold", "bold"] as const satisfies readonly TextWeight[]),
    ])("%s has a class in Text.module.css", (name) => {
        expect(hasClass(name)).toBe(true);
    });
});
