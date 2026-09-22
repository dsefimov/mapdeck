import { describe, expect, it } from "vitest";
import type { CachedNode } from "../../types";
import { cachedNode } from "../__testFactories";
import { truncateToPlan } from "./truncateToPlan";

const SMALL = "1-0-0-0";
const LARGE = "1-1-1-1";
const ALSO_SMALL = "1-1-0-0";

function sized(key: string, pointCount: number): CachedNode {
    return cachedNode(key, { state: "pending", pointCount });
}

const CACHE: ReadonlyMap<string, CachedNode> = new Map([
    [SMALL, sized(SMALL, 100)],
    [LARGE, sized(LARGE, 1000)],
    [ALSO_SMALL, sized(ALSO_SMALL, 100)],
]);

describe("truncateToPlan", () => {
    it("keeps the plan intact when the whole of it fits", () => {
        expect(truncateToPlan([SMALL, ALSO_SMALL], CACHE, 500)).toEqual([
            SMALL,
            ALSO_SMALL,
        ]);
    });

    it("preserves the plan's order rather than repacking it", () => {
        expect(truncateToPlan([ALSO_SMALL, SMALL], CACHE, 500)).toEqual([
            ALSO_SMALL,
            SMALL,
        ]);
    });

    it("steps over a node too large and keeps filling with the rest", () => {
        expect(truncateToPlan([LARGE, SMALL], CACHE, 500)).toEqual([SMALL]);
    });

    it("takes nothing when no budget is left", () => {
        expect(truncateToPlan([SMALL], CACHE, 0)).toEqual([]);
    });

    it("treats an overdrawn budget as no budget rather than as credit", () => {
        expect(truncateToPlan([SMALL], CACHE, -500)).toEqual([]);
    });

    it("passes over a key the cache does not hold", () => {
        expect(truncateToPlan(["9-9-9-9", SMALL], CACHE, 500)).toEqual([SMALL]);
    });
});
