import { describe, expect, it } from "vitest";
import { Bbox, type BBox3D } from "@core/lib/geo";
import type { CachedNode, NodeState } from "../../types";
import { cachedNode } from "../__testFactories";
import {
    TileEvictionManager,
    type EvictionContext,
} from "./TileEvictionManager";

const IN_VIEW = "1-0-0-0";
const NEAR = "1-1-0-0";
const FAR = "1-1-1-1";
/** First child of NEAR ("1-1-0-0" → "2-2-0-0"): x*2 + bit per axis. */
const CHILD_OF_NEAR = "2-2-0-0";

const NODE_POINTS = 100;
const CURRENT_FRAME = 10;
/** Old enough that the tile is not a candidate of the current cycle. */
const LONG_UNSEEN = CURRENT_FRAME - 5;

const VIEWPORT: [number, number, number, number] = [10, 10, 11, 11];

/** Node geometry: inside the viewport, adjacent to it, or well beyond. */
function at(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
): { bounds: BBox3D; boundsWgs84: BBox3D } {
    const bounds = Bbox.fromCorners({
        minX,
        minY,
        minZ: 0,
        maxX,
        maxY,
        maxZ: 0,
    });
    return { bounds, boundsWgs84: bounds };
}

const IN_VIEW_BOX = at(10.2, 10.2, 10.8, 10.8);
const NEAR_BOX = at(11.01, 10, 11.02, 11);
const FAR_BOX = at(20, 20, 20.1, 20.1);

function loaded(
    key: string,
    geometry = NEAR_BOX,
    overrides: Partial<CachedNode> = {},
): CachedNode {
    return cachedNode(key, {
        pointCount: NODE_POINTS,
        lastSeenAt: LONG_UNSEEN,
        ...geometry,
        ...overrides,
    });
}

function context(
    nodes: CachedNode[],
    overrides: Partial<EvictionContext> = {},
): EvictionContext {
    return {
        totalPoints: nodes.length * NODE_POINTS,
        targetPoints: NODE_POINTS,
        currentFrame: CURRENT_FRAME,
        viewportBounds: VIEWPORT,
        nodeCache: new Map(nodes.map((node) => [node.key, node])),
        errorKeys: new Set<string>(),
        ...overrides,
    };
}

describe("TileEvictionManager", () => {
    it("frees nothing when the cache already sits within its target", () => {
        const node = loaded(IN_VIEW, IN_VIEW_BOX);
        const manager = new TileEvictionManager();

        const result = manager.evictToBudget(
            context([node], { targetPoints: NODE_POINTS * 10 }),
        );

        expect(result).toEqual({ freedPoints: 0, evictedCount: 0 });
        expect(node.state).toBe("loaded");
    });

    it("evicts the farthest tile first and stops once the target holds", () => {
        const inView = loaded(IN_VIEW, IN_VIEW_BOX);
        const near = loaded(NEAR, NEAR_BOX);
        const far = loaded(FAR, FAR_BOX);
        const manager = new TileEvictionManager();

        const result = manager.evictToBudget(
            context([inView, near, far], { targetPoints: NODE_POINTS * 2 }),
        );

        // 300 points against a 200 target: exactly the far tile goes.
        expect(result).toEqual({ freedPoints: NODE_POINTS, evictedCount: 1 });
        expect(far.state).toBe("pending");
        expect(near.state).toBe("loaded");
        expect(inView.state).toBe("loaded");
    });

    it("breaks distance ties by evicting the stalest stamp first", () => {
        const older = loaded(NEAR, NEAR_BOX, {
            lastSeenAt: CURRENT_FRAME - 9,
        });
        const newer = loaded(FAR, NEAR_BOX, {
            lastSeenAt: CURRENT_FRAME - 2,
        });
        const manager = new TileEvictionManager();

        manager.evictToBudget(
            context([older, newer], { targetPoints: NODE_POINTS }),
        );

        expect(older.state).toBe("pending");
        expect(newer.state).toBe("loaded");
    });

    it("never touches a tile the current cycle selected", () => {
        const wanted = loaded(NEAR, NEAR_BOX, {
            lastSeenAt: CURRENT_FRAME,
        });
        const manager = new TileEvictionManager();

        const result = manager.evictToBudget(
            context([wanted], { targetPoints: 0 }),
        );

        expect(result).toEqual({ freedPoints: 0, evictedCount: 0 });
        expect(wanted.state).toBe("loaded");
    });

    it.each<[NodeState]>([
        ["loading"],
        ["error"],
        ["pending"],
    ])("skips a %s tile, which holds nothing worth freeing", (state) => {
        const busy = loaded(NEAR, NEAR_BOX, { state });
        const spare = loaded(FAR, FAR_BOX);
        const manager = new TileEvictionManager();

        manager.evictToBudget(context([busy, spare]));

        expect(busy.state).toBe(state);
        expect(spare.state).toBe("pending");
    });

    it("keeps a parent while a child of it is loading — in-flight outright", () => {
        const parent = loaded(NEAR, NEAR_BOX);
        const child = loaded(CHILD_OF_NEAR, NEAR_BOX, {
            state: "loading",
            lastSeenAt: LONG_UNSEEN,
        });
        const spare = loaded(FAR, FAR_BOX);
        const manager = new TileEvictionManager();

        manager.evictToBudget(context([parent, child, spare]));

        expect(parent.state).toBe("loaded");
        expect(spare.state).toBe("pending");
    });

    it.each<[NodeState]>([["pending"], ["error"]])(
        "keeps a parent while a %s child stays a current candidate",
        (childState) => {
            const parent = loaded(NEAR, NEAR_BOX);
            const child = loaded(CHILD_OF_NEAR, NEAR_BOX, {
                state: childState,
                lastSeenAt: CURRENT_FRAME,
            });
            const spare = loaded(FAR, FAR_BOX);
            const manager = new TileEvictionManager();

            manager.evictToBudget(context([parent, child, spare]));

            expect(parent.state).toBe("loaded");
            expect(spare.state).toBe("pending");
        },
    );

    it.each<[NodeState]>([["pending"], ["error"]])(
        "frees a parent once its %s children went stale",
        (childState) => {
            const parent = loaded(NEAR, NEAR_BOX);
            const abandonedChild = loaded(CHILD_OF_NEAR, NEAR_BOX, {
                state: childState,
                lastSeenAt: LONG_UNSEEN,
            });
            const spare = loaded(FAR, FAR_BOX);
            const manager = new TileEvictionManager();

            manager.evictToBudget(context([parent, abandonedChild, spare]));

            // The stale child pins nothing — otherwise abandoned subtrees,
            // including ones with permanently broken children, would pin
            // their ancestors forever.
            expect(parent.state).toBe("pending");
        },
    );

    it("salvages each victim through the onEvict hook before clearing", () => {
        const far = loaded(FAR, FAR_BOX);
        const salvaged: string[] = [];
        const manager = new TileEvictionManager((tile) => {
            salvaged.push(tile.key);
        });

        manager.evictToBudget(context([far], { targetPoints: 0 }));

        expect(salvaged).toEqual([FAR]);
        expect(far.state).toBe("pending");
    });

    it("frees nothing when it holds no tiles at all", () => {
        const result = new TileEvictionManager().evictToBudget(
            context([], { totalPoints: NODE_POINTS, targetPoints: 0 }),
        );

        expect(result).toEqual({ freedPoints: 0, evictedCount: 0 });
    });
});
