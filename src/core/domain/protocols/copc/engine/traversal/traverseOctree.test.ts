import { describe, expect, it } from "vitest";
import RBush from "rbush";
import type { CachedNode } from "../../types";
import { cachedNode, cameraSnapshot } from "../__testFactories";
import {
    computeMaxDepthForNode,
    traverseOctree,
    type AntiOverzoomInput,
    type NodeBBoxEntry,
} from "./traverseOctree";

const ROOT_KEY = "0-0-0-0";
const FIRST_CHILD = "1-0-0-0";
const LAST_CHILD = "1-1-1-1";

const MAX_DEPTH = 20;

/** Whole world, so the prefilter admits every node unless a test says otherwise. */
const WORLD: [number, number, number, number] = [-180, -90, 180, 90];

/** Screen error can never fall this low, so every node keeps refining. */
const REFINE_ALWAYS = 0;

/** Screen error can never reach this, so the first node is already enough. */
const REFINE_NEVER = 1e9;

function overzoomInput(
    overrides: Partial<AntiOverzoomInput> = {},
): AntiOverzoomInput {
    return {
        rootSpacing: 100,
        distanceToCamera: 10_000,
        camera: cameraSnapshot(),
        maxOctreeDepth: MAX_DEPTH,
        maxScreenErrorPx: 2,
        ...overrides,
    };
}

function indexOf(keys: string[]): RBush<NodeBBoxEntry> {
    const index = new RBush<NodeBBoxEntry>();
    index.load(
        keys.map((key) => ({ minX: 10, minY: 10, maxX: 11, maxY: 11, key })),
    );
    return index;
}

function traverse(
    cache: Map<string, CachedNode>,
    maxScreenErrorPx: number,
    indexedKeys = [...cache.keys()],
): ReturnType<typeof traverseOctree> {
    return traverseOctree({
        rootKey: ROOT_KEY,
        nodeCache: cache,
        spatialIndex: indexOf(indexedKeys),
        priorityStateMap: new WeakMap(),
        maxOctreeDepth: MAX_DEPTH,
        camera: cameraSnapshot(),
        viewportBounds: WORLD,
        maxScreenErrorPx,
        geometricErrorByDepth: () => 10,
    });
}

function cacheOf(...keys: string[]): Map<string, CachedNode> {
    return new Map(keys.map((key) => [key, cachedNode(key)]));
}

describe("computeMaxDepthForNode", () => {
    it("lifts the cap entirely within two kilometres, leaving screen error in charge", () => {
        expect(
            computeMaxDepthForNode(overzoomInput({ distanceToCamera: 1999 })),
        ).toBe(MAX_DEPTH);
    });

    it("costs one level of depth for every doubling of the distance", () => {
        const near = computeMaxDepthForNode(
            overzoomInput({ distanceToCamera: 10_000 }),
        );
        const far = computeMaxDepthForNode(
            overzoomInput({ distanceToCamera: 20_000 }),
        );

        expect(near - far).toBe(1);
    });

    it("caps shallower as the tolerated screen error grows", () => {
        const strict = computeMaxDepthForNode(
            overzoomInput({ maxScreenErrorPx: 1 }),
        );
        const lax = computeMaxDepthForNode(
            overzoomInput({ maxScreenErrorPx: 4 }),
        );

        expect(lax).toBeLessThan(strict);
    });

    it("allows two levels beyond the resolution the screen can actually show", () => {
        const groundRes = (10_000 * 2 * Math.tan(Math.PI / 6)) / 1080;
        const strict = Math.floor(Math.log2(100 / (groundRes * 2)));

        expect(computeMaxDepthForNode(overzoomInput())).toBe(strict + 2);
    });

    it.each<[string, Partial<AntiOverzoomInput>]>([
        ["a spacing of zero", { rootSpacing: 0 }],
        ["a spacing that is not a number", { rootSpacing: NaN }],
    ])("falls back to the octree maximum for %s", (_case, overrides) => {
        expect(computeMaxDepthForNode(overzoomInput(overrides))).toBe(
            MAX_DEPTH,
        );
    });

    it("never returns a negative depth, however far away the node is", () => {
        expect(
            computeMaxDepthForNode(
                overzoomInput({ distanceToCamera: 1e9, rootSpacing: 0.01 }),
            ),
        ).toBe(0);
    });
});

describe("traverseOctree", () => {
    it("stops at the first node that is already detailed enough", () => {
        const result = traverse(cacheOf(ROOT_KEY, FIRST_CHILD), REFINE_NEVER);

        expect(result.candidates.map((c) => c.key)).toEqual([ROOT_KEY]);
    });

    it("descends into every loaded child while none is detailed enough", () => {
        const result = traverse(
            cacheOf(ROOT_KEY, FIRST_CHILD, LAST_CHILD),
            REFINE_ALWAYS,
        );

        expect(result.candidates.map((c) => c.key)).toEqual([
            ROOT_KEY,
            FIRST_CHILD,
            LAST_CHILD,
        ]);
    });

    it("records the parent each child can fall back to", () => {
        const result = traverse(
            cacheOf(ROOT_KEY, FIRST_CHILD, LAST_CHILD),
            REFINE_ALWAYS,
        );

        expect([...result.fallbacks]).toEqual([
            [FIRST_CHILD, ROOT_KEY],
            [LAST_CHILD, ROOT_KEY],
        ]);
    });

    it("asks for the hierarchy page of a node that needs children it does not have", () => {
        const result = traverse(cacheOf(ROOT_KEY), REFINE_ALWAYS);

        expect(result.pendingHierarchyExpansions).toEqual([ROOT_KEY]);
    });

    it("asks for nothing when the node is detailed enough as it stands", () => {
        const result = traverse(cacheOf(ROOT_KEY), REFINE_NEVER);

        expect(result.pendingHierarchyExpansions).toEqual([]);
    });

    it("drops a node the spatial prefilter never returned, and its subtree with it", () => {
        const result = traverse(
            cacheOf(ROOT_KEY, FIRST_CHILD, LAST_CHILD),
            REFINE_ALWAYS,
            [ROOT_KEY, LAST_CHILD],
        );

        expect(result.candidates.map((c) => c.key)).toEqual([
            ROOT_KEY,
            LAST_CHILD,
        ]);
    });

    it("returns nothing at all when the root is not in the cache", () => {
        const result = traverse(cacheOf(FIRST_CHILD), REFINE_ALWAYS);

        expect(result.candidates).toEqual([]);
    });
});
