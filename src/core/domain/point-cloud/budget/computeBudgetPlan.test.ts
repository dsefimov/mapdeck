import { describe, it, expect } from "vitest";
import { computeBudgetPlan } from "./computeBudgetPlan";
import type { CachedNode, CandidateNode } from "@core/framework/types";

/** Create a minimal CachedNode for testing. */
function makeNode(
    key: string,
    state: CachedNode["state"],
    pointCount: number,
): CachedNode {
    return {
        key,
        keyArray: key.split("-").map(Number) as [
            number,
            number,
            number,
            number,
        ],
        state,
        pointCount,
        pointDataOffset: 0,
        pointDataLength: 0,
        bounds: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
        boundsWgs84: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
    };
}

/** Create a minimal CandidateNode for testing. */
function makeCandidate(key: string, priority: number): CandidateNode {
    return {
        key,
        screenError: 1,
        screenProjectedArea: 100,
        priority,
        distanceToCamera: 100,
    };
}

function toMap(nodes: CachedNode[]): Map<string, CachedNode> {
    return new Map(nodes.map((n) => [n.key, n]));
}

describe("computeBudgetPlan", () => {
    it("candidates fit within budget with resident nodes", () => {
        // Original (pre-fix) behavior: toLoad points are double-counted in deficit.
        // runningPointCount=200+300+400=900, toLoadPoints=700, deficit=900+700-1000=600
        const nodeCache = toMap([
            makeNode("0-0-0-0", "loaded", 200),
            makeNode("1-0-0-0", "pending", 300),
            makeNode("1-1-0-0", "pending", 400),
        ]);
        const candidates: CandidateNode[] = [
            makeCandidate("1-0-0-0", 10),
            makeCandidate("1-1-0-0", 5),
        ];
        const plan = computeBudgetPlan(candidates, nodeCache, 1000, new Map());
        // Accepted contains all 3 nodes, toLoad contains both pending
        expect(plan.accepted.length).toBe(3);
        expect(plan.toLoad).toContain("1-0-0-0");
        expect(plan.toLoad).toContain("1-1-0-0");
    });

    it("deficit includes toLoad points (original double-count behavior)", () => {
        const nodeCache = toMap([
            makeNode("0-0-0-0", "loaded", 600),
            makeNode("1-0-0-0", "pending", 300),
            makeNode("1-1-0-0", "pending", 400),
        ]);
        const candidates: CandidateNode[] = [
            makeCandidate("1-0-0-0", 10),
            makeCandidate("1-1-0-0", 5),
        ];
        const plan = computeBudgetPlan(candidates, nodeCache, 1000, new Map());
        // runningPointCount=600+300=900, toLoadPoints=300, deficit=900+300-1000=200
        expect(plan.deficit).toBe(200);
        expect(plan.toLoad).toEqual(["1-0-0-0"]);
    });

    it("parent-fallback block fits within budget", () => {
        const nodeCache = toMap([
            makeNode("0-0-0-0", "loaded", 100),
            makeNode("1-0-0-0", "pending", 50),
            makeNode("1-0-0-1", "pending", 60),
        ]);
        const candidates: CandidateNode[] = [
            makeCandidate("1-0-0-0", 10),
            makeCandidate("1-0-0-1", 8),
        ];
        const fallbacks = new Map([
            ["1-0-0-0", "0-0-0-0"],
            ["1-0-0-1", "0-0-0-0"],
        ]);
        const plan = computeBudgetPlan(candidates, nodeCache, 500, fallbacks);
        expect(plan.accepted).toContain("0-0-0-0");
        expect(plan.toLoad).toContain("1-0-0-0");
        expect(plan.toLoad).toContain("1-0-0-1");
    });
});
