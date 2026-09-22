import { describe, expect, it } from "vitest";
import type { CachedNode, NodeState } from "../../types";
import { cachedNode } from "../__testFactories";
import {
    TileEvictionManager,
    type EvictionContext,
} from "./TileEvictionManager";

const OLDEST = "1-0-0-0";
const MIDDLE = "1-1-0-0";
const NEWEST = "1-1-1-1";
const CHILD_OF_OLDEST = "2-0-0-0";

const NODE_POINTS = 100;
const CURRENT_FRAME = 10;

/** Old enough that the two-frame hysteresis lets the tile go. */
const LONG_UNSEEN = CURRENT_FRAME - 5;

function loaded(key: string, overrides: Partial<CachedNode> = {}): CachedNode {
    return cachedNode(key, {
        pointCount: NODE_POINTS,
        lastSeenAt: LONG_UNSEEN,
        ...overrides,
    });
}

function context(
    nodes: CachedNode[],
    overrides: Partial<EvictionContext> = {},
): EvictionContext {
    return {
        totalPoints: nodes.length * NODE_POINTS,
        targetBudget: NODE_POINTS,
        currentFrame: CURRENT_FRAME,
        nodeCache: new Map(nodes.map((node) => [node.key, node])),
        errorKeys: new Set<string>(),
        ...overrides,
    };
}

/** Touch in argument order, so the first argument ends up at the tail. */
function managerOver(nodes: CachedNode[]): TileEvictionManager<CachedNode> {
    const manager = new TileEvictionManager<CachedNode>();
    for (const node of nodes) manager.touch(node);
    return manager;
}

describe("TileEvictionManager", () => {
    it("evicts from the least recently touched end until the target is met", () => {
        const nodes = [loaded(OLDEST), loaded(MIDDLE), loaded(NEWEST)];
        const manager = managerOver(nodes);

        const result = manager.evictToBudget(context(nodes));

        expect(result).toEqual({
            freedPoints: NODE_POINTS * 2,
            evictedCount: 2,
        });
        expect(nodes.map((n) => n.state)).toEqual([
            "pending",
            "pending",
            "loaded",
        ]);
    });

    it("spares a tile that was touched again since", () => {
        const [oldest, middle, newest] = [
            loaded(OLDEST),
            loaded(MIDDLE),
            loaded(NEWEST),
        ];
        const manager = managerOver([oldest, middle, newest]);
        manager.touch(oldest);

        manager.evictToBudget(
            context([oldest, middle, newest], {
                targetBudget: NODE_POINTS * 2,
            }),
        );

        expect(middle.state).toBe("pending");
        expect(oldest.state).toBe("loaded");
    });

    it("stops at the render-frame boundary rather than dropping what was just drawn", () => {
        const nodes = [loaded(OLDEST), loaded(MIDDLE), loaded(NEWEST)];
        const manager = managerOver(nodes);
        manager.markStartOfRenderFrame();

        const result = manager.evictToBudget(
            context(nodes, { targetBudget: 0 }),
        );

        expect(result.evictedCount).toBe(2);
        expect(nodes[2]?.state).toBe("loaded");
    });

    it("moves a rendered tile out of reach for the rest of the frame", () => {
        const [oldest, middle, newest] = [
            loaded(OLDEST),
            loaded(MIDDLE),
            loaded(NEWEST),
        ];
        const manager = managerOver([oldest, middle, newest]);
        manager.markStartOfRenderFrame();
        manager.markTileRendered(oldest);

        manager.evictToBudget(
            context([oldest, middle, newest], { targetBudget: 0 }),
        );

        expect(oldest.state).toBe("loaded");
    });

    it.each<[NodeState]>([
        ["loading"],
        ["error"],
        ["pending"],
    ])("skips a %s tile, which holds nothing worth freeing", (state) => {
        const busy = loaded(OLDEST, { state });
        const spare = loaded(MIDDLE);
        const manager = managerOver([busy, spare]);

        manager.evictToBudget(context([busy, spare]));

        expect(busy.state).toBe(state);
        expect(spare.state).toBe("pending");
    });

    it("keeps a tile seen in the previous frame, giving it two frames of grace", () => {
        const recent = loaded(OLDEST, { lastSeenAt: CURRENT_FRAME - 1 });
        const stale = loaded(MIDDLE);
        const manager = managerOver([recent, stale]);

        manager.evictToBudget(context([recent, stale]));

        expect(recent.state).toBe("loaded");
        expect(stale.state).toBe("pending");
    });

    it("keeps a parent while a child of it is loading — in-flight outright", () => {
        const parent = loaded(OLDEST);
        const child = loaded(CHILD_OF_OLDEST, {
            state: "loading",
            lastSeenAt: LONG_UNSEEN,
        });
        const spare = loaded(MIDDLE);
        const manager = managerOver([parent, spare]);

        manager.evictToBudget(context([parent, child, spare]));

        expect(parent.state).toBe("loaded");
        expect(spare.state).toBe("pending");
    });

    it.each<[NodeState]>([["pending"], ["error"]])(
        "keeps a parent while a %s child stays traversal-relevant",
        (childState) => {
            const parent = loaded(OLDEST);
            const child = loaded(CHILD_OF_OLDEST, {
                state: childState,
                lastSeenAt: CURRENT_FRAME,
            });
            const spare = loaded(MIDDLE);
            const manager = managerOver([parent, spare]);

            manager.evictToBudget(context([parent, child, spare]));

            expect(parent.state).toBe("loaded");
            expect(spare.state).toBe("pending");
        },
    );

    it.each<[NodeState]>([["pending"], ["error"]])(
        "frees a parent once its %s children go stale",
        (childState) => {
            const parent = loaded(OLDEST);
            const abandonedChild = loaded(CHILD_OF_OLDEST, {
                state: childState,
                lastSeenAt: LONG_UNSEEN,
            });
            const spare = loaded(MIDDLE);
            const manager = managerOver([parent, spare]);

            manager.evictToBudget(
                context([parent, abandonedChild, spare]),
            );

            // The stale child pins nothing — otherwise abandoned subtrees,
            // including ones with permanently broken children, would pin
            // their ancestors forever.
            expect(parent.state).toBe("pending");
        },
    );

    it("evicts a parent whose children are all settled", () => {
        const parent = loaded(OLDEST);
        const child = loaded(CHILD_OF_OLDEST);
        const manager = managerOver([parent]);

        manager.evictToBudget(
            context([parent, child], { targetBudget: 0, totalPoints: 100 }),
        );

        expect(parent.state).toBe("pending");
    });

    it("frees nothing when the cache already sits within its budget", () => {
        const nodes = [loaded(OLDEST)];
        const manager = managerOver(nodes);

        const result = manager.evictToBudget(
            context(nodes, { targetBudget: NODE_POINTS * 10 }),
        );

        expect(result).toEqual({ freedPoints: 0, evictedCount: 0 });
        expect(nodes[0]?.state).toBe("loaded");
    });

    it("frees nothing when it holds no tiles at all", () => {
        const result = new TileEvictionManager<CachedNode>().evictToBudget(
            context([], { totalPoints: NODE_POINTS, targetBudget: 0 }),
        );

        expect(result).toEqual({ freedPoints: 0, evictedCount: 0 });
    });
});
