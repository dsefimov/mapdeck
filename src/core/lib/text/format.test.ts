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

    it("never reads the prototype chain — {constructor} stays a placeholder", () => {
        expect(formatDict("{constructor}", {})).toBe("{constructor}");
    });

    it("interpolates numeric-string keys like any other", () => {
        // {1} matches the \w+ pattern — it stays only when the key is absent.
        expect(formatDict("{1} and {}", {})).toBe("{1} and {}");
        expect(formatDict("{1}", { "1": "x" })).toBe("x");
    });
});
