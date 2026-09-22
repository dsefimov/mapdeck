import { describe, expect, it } from "vitest";
import { shouldRetryAfterTruncation } from "./shouldRetryAfterTruncation";

interface RetryCase {
    title: string;
    finalToLoadCount: number;
    plannedToLoadCount: number;
    freedPoints: number;
    expected: boolean;
}

describe("shouldRetryAfterTruncation", () => {
    it.each<RetryCase>([
        {
            title: "retries when the plan was cut short and eviction made room",
            finalToLoadCount: 3,
            plannedToLoadCount: 5,
            freedPoints: 1000,
            expected: true,
        },
        {
            title: "stays put when nothing was cut from the plan",
            finalToLoadCount: 5,
            plannedToLoadCount: 5,
            freedPoints: 1000,
            expected: false,
        },
        {
            title: "stays put when eviction freed nothing, since the next cycle would repeat this one",
            finalToLoadCount: 3,
            plannedToLoadCount: 5,
            freedPoints: 0,
            expected: false,
        },
        {
            title: "needs a whole point freed, not merely an attempt",
            finalToLoadCount: 0,
            plannedToLoadCount: 5,
            freedPoints: 0,
            expected: false,
        },
    ])(
        "$title",
        ({
            finalToLoadCount,
            plannedToLoadCount,
            freedPoints,
            expected,
        }) => {
            expect(
                shouldRetryAfterTruncation(
                    finalToLoadCount,
                    plannedToLoadCount,
                    freedPoints,
                ),
            ).toBe(expected);
        },
    );
});
