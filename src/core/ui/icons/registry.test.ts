import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { iconNames, isIconName } from "./registry";

/**
 * Icons are theme tokens: every registry name must have artwork
 * (`--icon-<name>` in theme.css) and a mask rule in Icon.module.css —
 * the three lists are one list, kept in sync here rather than by
 * convention.
 */

const SRC_ROOT = join(__dirname, "..", "..", "..", "..");

const iconModuleCss = readFileSync(
    join(
        SRC_ROOT,
        "src",
        "core",
        "ui",
        "components",
        "primitives",
        "icon",
        "Icon.module.css",
    ),
    "utf8",
);

const themeCss = readFileSync(
    join(SRC_ROOT, "src", "core", "ui", "theme", "theme.css"),
    "utf8",
);

describe("icon registry", () => {
    it.each(iconNames)("%s has an artwork token in the theme", (name) => {
        expect(themeCss).toMatch(new RegExp(`--icon-${name}:\\s*url\\(`));
    });

    it.each(iconNames)("%s has a mask rule in Icon.module.css", (name) => {
        expect(iconModuleCss).toMatch(new RegExp(`\\.${name}\\s*\\{`));
    });

    it("isIconName accepts registry names and rejects anything else", () => {
        expect(isIconName("zoom")).toBe(true);
        expect(isIconName("sm")).toBe(false); // size token, not an icon
        expect(isIconName("no-such-icon")).toBe(false);
        expect(isIconName("")).toBe(false);
    });
});
