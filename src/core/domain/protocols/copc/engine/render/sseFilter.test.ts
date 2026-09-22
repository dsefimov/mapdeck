import { describe, expect, it } from "vitest";
import type { CachedNode } from "../../types";
import { cachedNode, cameraSnapshot } from "../__testFactories";
import { getOctreeParentKey, parseOctreeKey } from "../octree/octreeKey";
import { computeVisibleCachedNodes } from "./computeVisibleCachedNodes";
import { filterFrustumVisible } from "./frustumFilter";
import { applySSEFilter, type SSEFilterInput } from "./sseFilter";

const ROOT_KEY = "0-0-0-0";
const CHILD_KEY = "1-0-0-0";

/** Screen error collapses to zero, so every node is detailed enough. */
const ALWAYS_DETAILED = (): number => 0;

/** Screen error explodes, so no node can ever be detailed enough. */
const ALWAYS_COARSE = (): number => 1e12;

function cacheOf(...nodes: CachedNode[]): Map<string, CachedNode> {
    return new Map(nodes.map((node) => [node.key, node]));
}

/**
 * Mirror of CycleExecutor._updateCandidateMetadata: attach the parent
 * reference, coarsest node first.
 */
function linkAncestors(cache: Map<string, CachedNode>): void {
    const byDepth = [...cache.values()].sort(
        (a, b) => parseOctreeKey(a.key)[0] - parseOctreeKey(b.key)[0],
    );
    for (const node of byDepth) {
        const parentKey = getOctreeParentKey(node.key);
        if (parentKey) node.parent = cache.get(parentKey) ?? null;
    }
}

function filterInput(
    cache: Map<string, CachedNode>,
    geometricErrorByDepth: () => number,
): SSEFilterInput {
    const camera = cameraSnapshot();
    return {
        frustumVisible: filterFrustumVisible(cache, camera),
        nodeCache: cache,
        camera,
        geometricErrorByDepth,
        maxScreenErrorPx: 1,
    };
}

describe("applySSEFilter", () => {
    it("renders a detailed enough node and skips the subtree it covers", () => {
        const cache = cacheOf(cachedNode(ROOT_KEY), cachedNode(CHILD_KEY));
        linkAncestors(cache);

        expect(applySSEFilter(filterInput(cache, ALWAYS_DETAILED))).toEqual([
            ROOT_KEY,
        ]);
    });

    it("renders a coarse node as-is when it has no loaded children", () => {
        const cache = cacheOf(cachedNode(ROOT_KEY));

        expect(applySSEFilter(filterInput(cache, ALWAYS_COARSE))).toEqual([
            ROOT_KEY,
        ]);
    });

    it("renders a coarse child as-is when its loaded parent left the cache", () => {
        const cache = cacheOf(cachedNode(ROOT_KEY), cachedNode(CHILD_KEY));
        linkAncestors(cache);
        cache.delete(ROOT_KEY);

        expect(applySSEFilter(filterInput(cache, ALWAYS_COARSE))).toEqual([
            CHILD_KEY,
        ]);
    });

    it("yields to the loaded children of a coarse node", () => {
        const cache = cacheOf(cachedNode(ROOT_KEY), cachedNode(CHILD_KEY));
        linkAncestors(cache);

        expect(applySSEFilter(filterInput(cache, ALWAYS_COARSE))).toEqual([
            CHILD_KEY,
        ]);
    });

    it("keeps a coarse node on screen while its children are still loading", () => {
        const cache = cacheOf(
            cachedNode(ROOT_KEY),
            cachedNode(CHILD_KEY, { state: "loading" }),
        );
        linkAncestors(cache);

        expect(applySSEFilter(filterInput(cache, ALWAYS_COARSE))).toEqual([
            ROOT_KEY,
        ]);
    });

    it("holds the coarse parent while only part of its family has loaded", () => {
        // One sibling loaded, another still loading: dropping the parent
        // would leave the loading sibling's region empty.
        const cache = cacheOf(
            cachedNode(ROOT_KEY),
            cachedNode(CHILD_KEY),
            cachedNode("1-1-1-1", { state: "loading" }),
        );
        linkAncestors(cache);

        expect(applySSEFilter(filterInput(cache, ALWAYS_COARSE))).toEqual([
            ROOT_KEY,
            CHILD_KEY,
        ]);
    });

    it.each<[string, [string, string]]>([
        ["insertion order", [CHILD_KEY, "1-1-1-1"]],
        ["reverse insertion order", ["1-1-1-1", CHILD_KEY]],
    ])(
        "emits a stable key order, here from %s",
        (_case, [firstKey, secondKey]) => {
            const cache = cacheOf(
                cachedNode(firstKey),
                cachedNode(secondKey),
            );

            expect(
                applySSEFilter(filterInput(cache, ALWAYS_DETAILED)),
            ).toEqual([CHILD_KEY, "1-1-1-1"]);
        },
    );
});

describe("computeVisibleCachedNodes", () => {
    it("returns nothing while no node has finished loading", () => {
        const cache = cacheOf(cachedNode(ROOT_KEY, { state: "pending" }));

        expect(
            computeVisibleCachedNodes(cache, cameraSnapshot(), {
                geometricErrorByDepth: ALWAYS_DETAILED,
                maxScreenErrorPx: 1,
            }),
        ).toEqual([]);
    });

    it("chains the frustum filter into the screen-error filter", () => {
        const cache = cacheOf(cachedNode(ROOT_KEY), cachedNode(CHILD_KEY));
        linkAncestors(cache);

        expect(
            computeVisibleCachedNodes(cache, cameraSnapshot(), {
                geometricErrorByDepth: ALWAYS_DETAILED,
                maxScreenErrorPx: 1,
            }),
        ).toEqual([ROOT_KEY]);
    });
});

