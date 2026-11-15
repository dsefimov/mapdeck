// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from "vitest";
import { logger } from "@core/lib/logger";
import {
    DEFAULT_COLOR_ACCENT,
    THEME_ACCENT,
    getMeasureColors,
    getThemeColor,
    getThemeValue,
    setThemeRoot,
    subscribeTheme,
} from "./themeColors";

// happy-dom loads no stylesheets: every custom property is missing, so the
// browser fallback branches are exercised (themeTokens.test.ts covers SSR).
describe("getThemeColor browser fallbacks", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

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

    it("falls back and warns on a non-hex token value", () => {
        vi.spyOn(window, "getComputedStyle").mockImplementation(
            () =>
                ({
                    getPropertyValue: () => "rgb(0, 81, 202)",
                }) as unknown as CSSStyleDeclaration,
        );
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

        expect(getThemeColor(THEME_ACCENT, 60)).toEqual([52, 58, 64, 60]);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("measure colors keep the accent fallback in the browser", () => {
        const colors = getMeasureColors();
        expect(colors.stroke).toEqual([0, 81, 202, 200]);
        expect(colors.fill).toEqual([0, 81, 202, 60]);
    });
});

describe("theme root", () => {
    const TOKEN = "--tool-measure-stroke";

    afterEach(() => {
        vi.restoreAllMocks();
        setThemeRoot(document.documentElement);
    });

    it("reads tokens from the set root instead of <html>", () => {
        const container = document.createElement("div");
        // happy-dom resolves no custom properties, so the stub stands in for
        // the CSSOM: the subject is WHICH element the reader queries.
        const computed = vi
            .spyOn(window, "getComputedStyle")
            .mockImplementation((element) =>
                (element === container
                    ? { getPropertyValue: () => "#123456" }
                    : { getPropertyValue: () => "" }) as unknown as CSSStyleDeclaration,
            );

        setThemeRoot(container);
        expect(getThemeValue(TOKEN)).toBe("#123456");
        expect(getThemeColor(TOKEN)).toEqual([0x12, 0x34, 0x56, 255]);

        setThemeRoot(document.documentElement);
        expect(getThemeValue(TOKEN)).toBe("");
        expect(computed).toHaveBeenLastCalledWith(document.documentElement);
    });

    it("re-pointing the root notifies subscribers", () => {
        const listener = vi.fn();
        const unsubscribe = subscribeTheme(listener);
        setThemeRoot(document.createElement("div"));

        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it("a data-theme switch on the root notifies subscribers", async () => {
        const container = document.createElement("div");
        document.body.append(container);
        setThemeRoot(container);

        const listener = vi.fn();
        const unsubscribe = subscribeTheme(listener);

        container.setAttribute("data-theme", "dark");
        await vi.waitFor(() => expect(listener).toHaveBeenCalled());

        unsubscribe();
        container.remove();
    });
});
