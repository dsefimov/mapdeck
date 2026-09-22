// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import {
    DEFAULT_COLOR_ACCENT,
    getMeasureColors,
    getThemeColor,
} from "./themeColors";

// happy-dom loads no stylesheets: every custom property is missing, so the
// browser fallback branches are exercised (themeTokens.test.ts covers SSR).
describe("getThemeColor browser fallbacks", () => {
    it("honors alpha on a missing variable", () => {
        expect(getThemeColor("--definitely-missing", 60)).toEqual([
            52, 58, 64, 60,
        ]);
    });

    it("uses the caller's fallback", () => {
        expect(
            getThemeColor("--definitely-missing", 200, DEFAULT_COLOR_ACCENT),
        ).toEqual([0, 81, 202, 200]);
    });

    it("measure colors keep the accent fallback in the browser", () => {
        const colors = getMeasureColors();
        expect(colors.stroke).toEqual([0, 81, 202, 200]);
        expect(colors.fill).toEqual([0, 81, 202, 60]);
    });
});
