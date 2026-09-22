import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
    getMeasureColors,
    getThemeColor,
    subscribeTheme,
    THEME_ACCENT,
    DEFAULT_ACCENT_CSS,
} from "./themeColors";
import { hexToRgba } from "@core/lib/color";

/**
 * Smoke test for design-system tokens:
 * 1. All var(--x) in CSS modules are defined in theme.css / tool-tokens.css.
 * 2. The TS bridge returns expected values (light theme).
 */

const SRC_ROOT = join(__dirname, "..", "..", "..", "..");

const THEME_FILES = [
    join(SRC_ROOT, "src", "core", "ui", "theme", "theme.css"),
    join(SRC_ROOT, "src", "core", "ui", "theme", "tool-tokens.css"),
];

/** Element-scoped custom properties, set from JS inline style (not in the theme). */
const ELEMENT_SCOPED_VARS = new Set([
    "--slider-fill", // set inline from SliderInput (JS)
    "--depth", // set inline from the layer-tree BaseNode
    "--thumb-size", // local variable in .slider (SliderInput)
]);

const THEME_DEFS = new Set<string>();
for (const file of THEME_FILES) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
        const match = /^--[\w-]+:/.exec(line.trim());
        if (match) {
            THEME_DEFS.add(match[0].replace(":", "").trim());
        }
    }
}

function collectCssFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            files.push(...collectCssFiles(full));
        } else if (entry.endsWith(".css")) {
            files.push(full);
        }
    }
    return files;
}

describe("theme tokens", () => {
    it("every var(--x) in CSS modules is defined in the theme", () => {
        const cssFiles = collectCssFiles(join(SRC_ROOT, "src")).filter(
            (f) => !f.includes("vendor-overrides"),
        );
        const undefinedVars = new Set<string>();

        for (const file of cssFiles) {
            const content = readFileSync(file, "utf8");
            for (const match of content.matchAll(/var\((--[\w-]+)\)/g)) {
                const name = match[1]!;
                if (!THEME_DEFS.has(name) && !ELEMENT_SCOPED_VARS.has(name)) {
                    undefinedVars.add(
                        `${name} (${file.replace(SRC_ROOT, "")})`,
                    );
                }
            }
        }

        expect([...undefinedVars]).toEqual([]);
    });

    it("no hardcoded colors outside the theme in CSS modules", () => {
        const THEME_DIR = join(SRC_ROOT, "src", "core", "ui", "theme");
        const cssFiles = collectCssFiles(join(SRC_ROOT, "src")).filter(
            (f) => !f.startsWith(THEME_DIR),
        );
        const offenders: string[] = [];

        for (const file of cssFiles) {
            const content = readFileSync(file, "utf8");
            for (const match of content.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
                offenders.push(`${match[0]} (${file.replace(SRC_ROOT, "")})`);
            }
        }

        expect(offenders).toEqual([]);
    });

    it("getThemeColor returns light defaults in SSR mode", () => {
        // vitest without jsdom: no window → SSR branch
        expect(getThemeColor(THEME_ACCENT, 255)).toEqual([52, 58, 64, 255]);
    });

    it("getMeasureColors returns accent measurement defaults in SSR mode", () => {
        const colors = getMeasureColors();
        expect(colors.css.stroke).toBe(DEFAULT_ACCENT_CSS);
        expect(colors.stroke).toEqual([0, 81, 202, 200]);
        expect(colors.fill).toEqual([0, 81, 202, 60]);
    });

    it("subscribeTheme is SSR-safe and returns an unsubscribe", () => {
        const listener = vi.fn();
        const unsubscribe = subscribeTheme(listener);
        expect(typeof unsubscribe).toBe("function");

        unsubscribe();
        expect(listener).not.toHaveBeenCalled();
    });

    it("hexToRgba supports #RGB and #RRGGBBAA", () => {
        expect(hexToRgba("#fff", 128)).toEqual([255, 255, 255, 128]);
        expect(hexToRgba("#0051ca80")).toEqual([0, 81, 202, 128]);
    });
});
