import { describe, expect, it } from "vitest";
import { Bbox } from "@core/lib/geo";
import type { CachedNode, NodeState } from "../../types";
import { cachedNode, cameraSnapshot, permissivePlanes } from "../__testFactories";
import { filterFrustumVisible } from "./frustumFilter";

const ROOT_KEY = "0-0-0-0";

function cacheOf(...nodes: CachedNode[]): Map<string, CachedNode> {
    return new Map(nodes.map((node) => [node.key, node]));
}

function keysOf(nodes: CachedNode[]): string[] {
    return nodes.map((node) => node.key);
}

describe("filterFrustumVisible", () => {
    it.each<[NodeState]>([["pending"], ["loading"], ["error"]])(
        "skips a node in the %s state, since only loaded data can be drawn",
        (state) => {
            const cache = cacheOf(cachedNode(ROOT_KEY, { state }));
            expect(filterFrustumVisible(cache, cameraSnapshot())).toEqual([]);
        },
    );

    it("returns the loaded nodes and drops the rest", () => {
        const cache = cacheOf(
            cachedNode(ROOT_KEY),
            cachedNode("1-0-0-0", { state: "pending" }),
            cachedNode("1-1-1-1"),
        );
        expect(keysOf(filterFrustumVisible(cache, cameraSnapshot()))).toEqual([
            ROOT_KEY,
            "1-1-1-1",
        ]);
    });

    it("orders by octree depth numerically, not by key text", () => {
        const cache = cacheOf(
            cachedNode("10-0-0-0"),
            cachedNode("9-0-0-0"),
            cachedNode("2-0-0-0"),
        );
        expect(keysOf(filterFrustumVisible(cache, cameraSnapshot()))).toEqual([
            "2-0-0-0",
            "9-0-0-0",
            "10-0-0-0",
        ]);
    });

    it("breaks ties at equal depth by key, so the order is deterministic", () => {
        const cache = cacheOf(
            cachedNode("1-1-0-0"),
            cachedNode("1-0-0-0"),
            cachedNode("1-0-1-0"),
        );
        expect(keysOf(filterFrustumVisible(cache, cameraSnapshot()))).toEqual([
            "1-0-0-0",
            "1-0-1-0",
            "1-1-0-0",
        ]);
    });

    it("culls a node whose bounds fall outside the frustum", () => {
        const faraway = cachedNode(ROOT_KEY, {
            boundsWgs84: Bbox.fromCorners({
                minX: 100,
                minY: 100,
                minZ: 0,
                maxX: 101,
                maxY: 101,
                maxZ: 0,
            }),
        });
        const camera = cameraSnapshot({
            frustumPlanes: {
                ...permissivePlanes(),
                left: { normal: [1, 0, 0], distance: 50 },
            },
        });
        expect(filterFrustumVisible(cacheOf(faraway), camera)).toEqual([]);
    });

    it("returns nothing for an empty cache", () => {
        expect(filterFrustumVisible(new Map(), cameraSnapshot())).toEqual([]);
    });
});
