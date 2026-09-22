import { describe, expect, it } from "vitest";
import type { CachedNode } from "../../types";
import { cachedNode } from "../__testFactories";
import {
    reserveSiblingBlock,
    type BlockReservationInput,
} from "./reserveSiblingBlock";

const PARENT = "0-0-0-0";
const FIRST = "1-0-0-0";
const SECOND = "1-1-1-1";

const NODE_POINTS = 100;

function node(key: string): CachedNode {
    return cachedNode(key, { state: "pending", pointCount: NODE_POINTS });
}

function input(
    overrides: Partial<BlockReservationInput> = {},
): BlockReservationInput {
    return {
        parentKey: PARENT,
        parentNode: node(PARENT),
        siblingKeys: new Set([FIRST, SECOND]),
        runningPointCount: 0,
        pointBudget: NODE_POINTS * 3,
        nodeCache: new Map(
            [PARENT, FIRST, SECOND].map((key) => [key, node(key)]),
        ),
        accepted: new Set<string>(),
        ...overrides,
    };
}

describe("reserveSiblingBlock", () => {
    it("takes the parent and every sibling in one step when the block fits", () => {
        const accepted = new Set<string>();

        const block = reserveSiblingBlock(input({ accepted }));

        expect(block?.pointsConsumed).toBe(NODE_POINTS * 3);
        expect([...accepted]).toEqual([PARENT, FIRST, SECOND]);
    });

    it("puts the parent first, so a fallback is in place before its children", () => {
        const accepted = new Set<string>();

        reserveSiblingBlock(input({ accepted }));

        expect([...accepted][0]).toBe(PARENT);
    });

    it("takes nothing at all when the block does not fit whole", () => {
        const accepted = new Set<string>();

        const block = reserveSiblingBlock(
            input({ accepted, pointBudget: NODE_POINTS * 2.5 }),
        );

        expect(block).toBeNull();
        expect([...accepted]).toEqual([]);
    });

    it("measures the block against what the cycle has already spent", () => {
        const block = reserveSiblingBlock(
            input({ runningPointCount: NODE_POINTS }),
        );

        expect(block).toBeNull();
    });

    it("charges nothing for a parent the cycle already accepted", () => {
        const accepted = new Set([PARENT]);

        const block = reserveSiblingBlock(input({ accepted }));

        expect(block?.pointsConsumed).toBe(NODE_POINTS * 2);
        expect([...accepted]).toEqual([PARENT, FIRST, SECOND]);
    });

    it("charges nothing for a sibling the cycle already accepted", () => {
        const accepted = new Set([FIRST]);

        const block = reserveSiblingBlock(input({ accepted }));

        expect(block?.pointsConsumed).toBe(NODE_POINTS * 2);
        expect([...accepted]).toEqual([FIRST, PARENT, SECOND]);
    });

    it("passes over a sibling the cache does not hold", () => {
        const accepted = new Set<string>();

        const block = reserveSiblingBlock(
            input({
                siblingKeys: new Set([FIRST, "9-9-9-9"]),
                accepted,
            }),
        );

        expect(block?.pointsConsumed).toBe(NODE_POINTS * 2);
        expect([...accepted]).toEqual([PARENT, FIRST]);
    });

    it("reserves a block of parent alone when it has no siblings", () => {
        const block = reserveSiblingBlock(
            input({ siblingKeys: new Set<string>() }),
        );

        expect(block?.pointsConsumed).toBe(NODE_POINTS);
    });
});
