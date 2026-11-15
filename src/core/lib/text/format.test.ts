import { describe, expect, it } from "vitest";
import { interpolate } from "./format";

describe("interpolate", () => {
    it("interpolates placeholders with params", () => {
        expect(
            interpolate("Vertex {from} → {to}", { from: 1, to: 2 }),
        ).toBe("Vertex 1 → 2");
    });

    it("stringifies numbers and keeps strings verbatim", () => {
        expect(interpolate("{n} {s}", { n: 42, s: "km" })).toBe("42 km");
    });

    it("leaves missing placeholders as-is", () => {
        expect(interpolate("{missing} stays", {})).toBe("{missing} stays");
    });

    it("never reads the prototype chain — {constructor} stays a placeholder", () => {
        expect(interpolate("{constructor}", {})).toBe("{constructor}");
    });

    it("interpolates numeric-string keys like any other", () => {
        // {1} matches the \w+ pattern — it stays only when the key is absent.
        expect(interpolate("{1} and {}", {})).toBe("{1} and {}");
        expect(interpolate("{1}", { "1": "x" })).toBe("x");
    });
});
