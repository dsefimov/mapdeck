import { describe, expect, it } from "vitest";
import { formatDict } from "./format";

describe("formatDict", () => {
    it("interpolates placeholders with params", () => {
        expect(
            formatDict("Vertex {from} → {to}", { from: 1, to: 2 }),
        ).toBe("Vertex 1 → 2");
    });

    it("stringifies numbers and keeps strings verbatim", () => {
        expect(formatDict("{n} {s}", { n: 42, s: "km" })).toBe("42 km");
    });

    it("leaves missing placeholders as-is", () => {
        expect(formatDict("{missing} stays", {})).toBe("{missing} stays");
    });

    it("ignores braces without word content", () => {
        expect(formatDict("{1} and {}", {})).toBe("{1} and {}");
    });
});
