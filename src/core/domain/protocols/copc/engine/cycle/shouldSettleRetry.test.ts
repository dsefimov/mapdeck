import { describe, expect, it } from "vitest";
import { shouldSettleRetry } from "./shouldSettleRetry";

interface SettleCase {
    title: string;
    enqueuedCount: number;
    evictedCount: number;
    pendingDemandPoints: number;
    totalPoints: number;
    targetPoints: number;
    expected: boolean;
}

describe("shouldSettleRetry", () => {
    it.each<SettleCase>([
        {
            title: "settles after a productive cycle left demand unserved over target",
            enqueuedCount: 3,
            evictedCount: 1,
            pendingDemandPoints: 500,
            totalPoints: 1_000,
            targetPoints: 400,
            expected: true,
        },
        {
            title: "progress on eviction alone carries the chain",
            enqueuedCount: 0,
            evictedCount: 2,
            pendingDemandPoints: 500,
            totalPoints: 1_000,
            targetPoints: 400,
            expected: true,
        },
        {
            title: "stays put when the cycle moved nothing — a retry would repeat it",
            enqueuedCount: 0,
            evictedCount: 0,
            pendingDemandPoints: 500,
            totalPoints: 1_000,
            targetPoints: 400,
            expected: false,
        },
        {
            title: "stays put when the view's demand is satisfied",
            enqueuedCount: 5,
            evictedCount: 1,
            pendingDemandPoints: 0,
            totalPoints: 1_000,
            targetPoints: 400,
            expected: false,
        },
        {
            title: "stays put when residency already fits the target",
            enqueuedCount: 5,
            evictedCount: 1,
            pendingDemandPoints: 500,
            totalPoints: 400,
            targetPoints: 400,
            expected: false,
        },
    ])("$title", ({ expected, ...check }) => {
        expect(shouldSettleRetry(check)).toBe(expected);
    });
});
