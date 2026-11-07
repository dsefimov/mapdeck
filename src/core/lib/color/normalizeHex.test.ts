import { describe, expect, it } from "vitest";
import { normalizeHex } from "./normalizeHex";

describe("normalizeHex", () => {
    it("normalizes a 6-digit hex to lowercase with #", () => {
        expect(normalizeHex("33AAFF")).toBe("#33aaff");
        expect(normalizeHex("#33AAFF")).toBe("#33aaff");
    });

    it("rejects anything that is not six hex digits", () => {
        expect(normalizeHex("#33aaff00")).toBeNull();
        expect(normalizeHex("rgb(0, 0, 255)")).toBeNull();
        expect(normalizeHex("red")).toBeNull();
        expect(normalizeHex("#33aa")).toBeNull();
        expect(normalizeHex("")).toBeNull();
    });
});
