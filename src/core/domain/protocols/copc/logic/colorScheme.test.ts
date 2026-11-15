import { describe, it, expect } from "vitest";
import { ColorScheme } from "@core/contracts";
import { resolveColorScheme } from "./colorScheme";

describe("resolveColorScheme", () => {
    it.each([
        ["elevation", ColorScheme.ELEVATION],
        ["intensity", ColorScheme.INTENSITY],
        ["rgb", ColorScheme.RGB],
        ["classification", ColorScheme.CLASSIFICATION],
    ])("passes the known scheme %s through", (raw, expected) => {
        expect(resolveColorScheme(raw)).toBe(expected);
    });

    it.each([
        ["a missing value", undefined],
        ["an unknown scheme", "bogus"],
        ["a non-string value", 42],
    ])("falls back to RGB for %s", (_label, raw) => {
        expect(resolveColorScheme(raw)).toBe(ColorScheme.RGB);
    });
});
