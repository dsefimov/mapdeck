import { describe, expect, it } from "vitest";
import type { CachedNode, CandidateNode } from "../../types";
import { cachedNode } from "../__testFactories";
import { sumPendingDemandPoints } from "./demand";

function candidate(key: string): CandidateNode {
    return { key, screenError: 1, priority: 1, distanceToCamera: 1 };
}

function node(key: string, state: CachedNode["state"], pointCount: number) {
    return cachedNode(key, { state, pointCount });
}

describe("sumPendingDemandPoints", () => {
    it("sums only the candidates still waiting for their data", () => {
        const cache = new Map<string, CachedNode>([
            ["1-0-0-0", node("1-0-0-0", "pending", 100)],
            ["1-1-0-0", node("1-1-0-0", "loaded", 500)],
            ["1-1-1-0", node("1-1-1-0", "error", 50)],
            ["1-1-1-1", node("1-1-1-1", "loading", 200)],
        ]);

        const demand = sumPendingDemandPoints(
            [
                candidate("1-0-0-0"),
                candidate("1-1-0-0"),
                candidate("1-1-1-0"),
            ],
            cache,
        );

        // Loaded and loading candidates occupy their slots already.
        expect(demand).toBe(150);
    });

    it("is zero when every candidate is settled", () => {
        const cache = new Map<string, CachedNode>([
            ["1-0-0-0", node("1-0-0-0", "loaded", 100)],
        ]);

        expect(
            sumPendingDemandPoints([candidate("1-0-0-0")], cache),
        ).toBe(0);
    });

    it("ignores candidates missing from the cache", () => {
        expect(sumPendingDemandPoints([candidate("9-9-9-9")], new Map())).toBe(0);
    });
});
