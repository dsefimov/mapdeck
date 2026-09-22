import { describe, expect, it } from "vitest";
import type { CachedNode } from "../../types";
import { cachedNode } from "../__testFactories";
import type { PriorityBounds } from "./normalization";
import { updatePriority, type PriorityState } from "./updatePriority";

/**
 * Unit bounds for every criterion, so a seeded value normalizes to itself
 * and each assertion reads as the criterion rather than as arithmetic.
 */
const BOUNDS: PriorityBounds = {
    minDepth: 0,
    maxDepth: 4,
    minFoveatedFactor: 0,
    maxFoveatedFactor: 1,
    minReverseSSE: 0,
    maxReverseSSE: 1,
};

const KEY_A = "1-0-0-0";
const KEY_B = "1-1-1-1";

/** One step of the foveated group, which sits four digits above the sort group. */
const FOVEATED_STEP = 10_000;

type Criteria = Partial<Omit<PriorityState, "priority">>;

interface Fixture {
    seed: (key: string, criteria: Criteria) => CachedNode;
    rank: (node: CachedNode) => number;
}

/** A fresh state map plus the two operations every ordering test needs. */
function fixture(): Fixture {
    const states = new WeakMap<CachedNode, PriorityState>();
    return {
        seed(key, criteria) {
            const node = cachedNode(key);
            states.set(node, {
                priority: 0,
                distanceToCamera: 0,
                foveatedFactor: 0,
                depth: 0,
                priorityReverseScreenSpaceError: 0,
                ...criteria,
            });
            return node;
        },
        rank: (node) => updatePriority(node, BOUNDS, states),
    };
}

describe("updatePriority", () => {
    it("scores an urgent tile below a settled one — the rank ascends as urgency falls", () => {
        const { seed, rank } = fixture();
        const centeredAndBlurry = seed(KEY_A, {
            foveatedFactor: 0,
            priorityReverseScreenSpaceError: 0,
        });
        const peripheralAndSharp = seed(KEY_B, {
            foveatedFactor: 1,
            priorityReverseScreenSpaceError: 1,
        });

        expect(rank(centeredAndBlurry)).toBeLessThan(rank(peripheralAndSharp));
    });

    it("lets foveation outrank screen error, however sharp the centered tile is", () => {
        const { seed, rank } = fixture();
        const centeredButSharp = seed(KEY_A, {
            foveatedFactor: 0,
            priorityReverseScreenSpaceError: 1,
        });
        const peripheralButBlurry = seed(KEY_B, {
            foveatedFactor: 1,
            priorityReverseScreenSpaceError: 0,
        });

        expect(rank(centeredButSharp)).toBeLessThan(rank(peripheralButBlurry));
    });

    it("confines screen error to less than one foveated step, which is why it cannot outrank it", () => {
        const { seed, rank } = fixture();
        const sharpest = seed(KEY_A, { priorityReverseScreenSpaceError: 0 });
        const blurriest = seed(KEY_B, { priorityReverseScreenSpaceError: 1 });

        expect(rank(blurriest) - rank(sharpest)).toBeLessThan(FOVEATED_STEP);
    });

    it("holds that confinement even for a criterion far beyond its bounds", () => {
        const { seed, rank } = fixture();
        const overflowing = seed(KEY_A, {
            priorityReverseScreenSpaceError: 5,
        });
        const baseline = seed(KEY_B, {});

        expect(rank(overflowing) - rank(baseline)).toBeLessThan(FOVEATED_STEP);
    });

    it("orders equally foveated tiles by screen error, the blurriest first", () => {
        const { seed, rank } = fixture();
        const blurry = seed(KEY_A, {
            foveatedFactor: 0.5,
            priorityReverseScreenSpaceError: 0.2,
        });
        const sharp = seed(KEY_B, {
            foveatedFactor: 0.5,
            priorityReverseScreenSpaceError: 0.8,
        });

        expect(rank(blurry)).toBeLessThan(rank(sharp));
    });

    it("breaks a full tie by depth, the coarsest first, within a single unit", () => {
        const { seed, rank } = fixture();
        const shallow = seed(KEY_A, { depth: 1 });
        const deep = seed(KEY_B, { depth: 3 });

        expect(rank(shallow)).toBeLessThan(rank(deep));
        expect(rank(deep) - rank(shallow)).toBeLessThan(1);
    });

    it("never lets the whole depth range outrank a single step of screen error", () => {
        const { seed, rank } = fixture();
        const deepestAndBlurriest = seed(KEY_A, {
            depth: 4,
            priorityReverseScreenSpaceError: 0,
        });
        const shallowestAndSharper = seed(KEY_B, {
            depth: 0,
            priorityReverseScreenSpaceError: 0.001,
        });

        expect(rank(deepestAndBlurriest)).toBeLessThan(
            rank(shallowestAndSharper),
        );
    });

    it("reads foveation from the tile's own state", () => {
        const { seed, rank } = fixture();
        const peripheral = seed(KEY_A, { foveatedFactor: 1 });
        const centered = seed(KEY_B, { foveatedFactor: 0 });

        expect(rank(centered)).toBeLessThan(rank(peripheral));
    });

    it("scores a tile the traversal never visited as if every criterion were at its minimum", () => {
        const { seed, rank } = fixture();
        const unvisited = cachedNode(KEY_A);
        const visited = seed(KEY_B, { foveatedFactor: 0.5 });

        expect(rank(unvisited)).toBeLessThan(rank(visited));
    });
});
