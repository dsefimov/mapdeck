import { describe, it, expect } from "vitest";
import { shouldRetryAfterTruncation } from "./shouldRetryAfterTruncation";

describe("shouldRetryAfterTruncation", () => {
    it("returns true when truncation happened AND eviction made progress", () => {
        // finalToLoad(3) < planned(5), freedPoints(1000) > 0 → retry
        expect(shouldRetryAfterTruncation(3, 5, 1000)).toBe(true);
    });

    it("returns false when truncation happened but eviction freed nothing", () => {
        // All loaded nodes evicted, no more to free
        expect(shouldRetryAfterTruncation(3, 5, 0)).toBe(false);
    });

    it("returns false when nothing was truncated", () => {
        // Everything fit
        expect(shouldRetryAfterTruncation(5, 5, 0)).toBe(false);
        expect(shouldRetryAfterTruncation(5, 5, 1000)).toBe(false);
    });

    it("returns false when eviction freed points but nothing was truncated", () => {
        // Eviction freed space, but all toLoad already fit
        expect(shouldRetryAfterTruncation(4, 4, 500)).toBe(false);
    });
});
