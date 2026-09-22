import { describe, expect, it } from "vitest";
import { priorityNormalizeAndClamp } from "./normalization";

const EPSILON7 = 1e-7;

/** Width of one base-10 criterion group in `updatePriority`. */
const LANE = 10_000;

interface ClampCase {
    title: string;
    value: number;
    minimum: number;
    maximum: number;
    expected: number;
}

describe("priorityNormalizeAndClamp", () => {
    it.each<ClampCase>([
        {
            title: "maps the midpoint of the range",
            value: 5,
            minimum: 0,
            maximum: 10,
            expected: 0.5 - EPSILON7,
        },
        {
            title: "maps a quarter of the range",
            value: 2.5,
            minimum: 0,
            maximum: 10,
            expected: 0.25 - EPSILON7,
        },
        {
            title: "maps a range that does not start at zero",
            value: 15,
            minimum: 10,
            maximum: 20,
            expected: 0.5 - EPSILON7,
        },
        {
            title: "maps a range that lies below zero",
            value: -5,
            minimum: -10,
            maximum: 0,
            expected: 0.5 - EPSILON7,
        },
        {
            title: "returns exactly zero at the minimum, the epsilon being clamped away",
            value: 0,
            minimum: 0,
            maximum: 10,
            expected: 0,
        },
        {
            title: "keeps the maximum strictly below one",
            value: 10,
            minimum: 0,
            maximum: 10,
            expected: 1 - EPSILON7,
        },
        {
            title: "clamps a value below the minimum",
            value: -5,
            minimum: 0,
            maximum: 10,
            expected: 0,
        },
        {
            title: "clamps a value above the maximum without reaching one",
            value: 15,
            minimum: 0,
            maximum: 10,
            expected: 1 - EPSILON7,
        },
    ])("$title", ({ value, minimum, maximum, expected }) => {
        expect(priorityNormalizeAndClamp(value, minimum, maximum)).toBeCloseTo(
            expected,
            12,
        );
    });

    it.each<[string, number]>([
        ["below", 3],
        ["equal to", 5],
        ["above", 8],
    ])(
        "collapses a degenerate range to zero for a value %s it",
        (_case, value) => {
            expect(priorityNormalizeAndClamp(value, 5, 5)).toBe(0);
        },
    );

    it.each<[string, number]>([
        ["at the upper bound", 10],
        ["far past the upper bound", 15],
    ])("keeps a value %s inside its own digit group", (_case, value) => {
        expect(Math.floor(priorityNormalizeAndClamp(value, 0, 10) * LANE)).toBe(
            LANE - 1,
        );
    });

    it.each<[string, number, number, number]>([
        ["the value never resolved", NaN, 0, 10],
        ["one node poisoned the lower bound", 5, NaN, 10],
        ["one node poisoned the upper bound", 5, 0, NaN],
    ])(
        "ranks a criterion least urgent when %s",
        (_case, value, minimum, maximum) => {
            expect(priorityNormalizeAndClamp(value, minimum, maximum)).toBe(
                1 - EPSILON7,
            );
        },
    );

    it("stays orderable against a sound criterion, so one bad node cannot scramble the rest", () => {
        const broken = priorityNormalizeAndClamp(NaN, 0, 10);

        expect(broken > priorityNormalizeAndClamp(9.99, 0, 10)).toBe(true);
    });
});
