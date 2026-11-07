import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { iconNames, isIconName } from "./registry";

/**
 * Icons are theme tokens: every registry name must have artwork
 * (`--icon-<name>` in theme.css) — the two lists are one list, kept in
 * sync here rather than by convention. The mask rendering needs no
 * per-name rule: Icon points the element-scoped --icon at the token.
 */

// Not a `?raw` import: vitest's disabled CSS pipeline mangles those to "".
const themeCss = readFileSync(
    join(__dirname, "..", "theme", "theme.css"),
    "utf8",
);

describe("icon registry", () => {
    it.each(iconNames)("%s has an artwork token in the theme", (name) => {
        expect(themeCss).toMatch(new RegExp(`--icon-${name}:\\s*url\\(`));
    });

    it("isIconName accepts registry names and rejects anything else", () => {
        expect(isIconName("zoom")).toBe(true);
        expect(isIconName("sm")).toBe(false); // size token, not an icon
        expect(isIconName("no-such-icon")).toBe(false);
        expect(isIconName("")).toBe(false);
    });
});
