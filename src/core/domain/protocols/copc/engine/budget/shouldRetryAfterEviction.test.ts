import { describe, expect, it } from "vitest";
import { shouldRetryAfterEviction } from "./shouldRetryAfterEviction";

interface RetryCase {
    title: string;
    finalToLoadCount: number;
    pendingDemandCount: number;
    freedPoints: number;
    expected: boolean;
}

describe("shouldRetryAfterEviction", () => {
    it.each<RetryCase>([
        {
            title: "retries when the plan was cut short and eviction made room",
            finalToLoadCount: 3,
            pendingDemandCount: 5,
            freedPoints: 1000,
            expected: true,
        },
        {
            title: "retries when a starved plan loaded nothing but eviction freed room",
            finalToLoadCount: 0,
            pendingDemandCount: 5,
            freedPoints: 1000,
            expected: true,
        },
        {
            title: "stays put when every wanting candidate was enqueued",
            finalToLoadCount: 5,
            pendingDemandCount: 5,
            freedPoints: 1000,
            expected: false,
        },
        {
            title: "stays put when nothing wants loading, whatever eviction freed",
            finalToLoadCount: 0,
            pendingDemandCount: 0,
            freedPoints: 1000,
            expected: false,
        },
        {
            title: "stays put when eviction freed nothing, since the next cycle would repeat this one",
            finalToLoadCount: 3,
            pendingDemandCount: 5,
            freedPoints: 0,
            expected: false,
        },
    ])(
        "$title",
        ({ finalToLoadCount, pendingDemandCount, freedPoints, expected }) => {
            expect(
                shouldRetryAfterEviction(
                    finalToLoadCount,
                    pendingDemandCount,
                    freedPoints,
                ),
            ).toBe(expected);
        },
    );
});
