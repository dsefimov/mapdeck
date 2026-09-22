import { describe, expect, it } from "vitest";
import { cachedNode } from "./__testFactories";
import {
    clearRetryState,
    computeRetryDelay,
    scheduleRetry,
} from "./utils";

/** The browser cache condition the loader backs off from harder. */
const CACHE_MARKER = "ERR_CACHE_OPERATION_NOT_SUPPORTED";
const GENERIC = "timeout";

const GENERIC_BASE = 1_000;
const CACHE_BASE = 10_000;
const CAP = 60_000;

const NOW = 1_700_000_000_000;

interface DelayCase {
    title: string;
    message: string;
    retryCount: number;
    expected: number;
}

describe("computeRetryDelay", () => {
    it.each<DelayCase>([
        {
            title: "waits the base second on a generic failure's first attempt",
            message: GENERIC,
            retryCount: 0,
            expected: GENERIC_BASE,
        },
        {
            title: "doubles the generic wait once per prior attempt",
            message: GENERIC,
            retryCount: 2,
            expected: GENERIC_BASE * 4,
        },
        {
            title: "starts a cache failure ten times further out, since it will not clear in a second",
            message: CACHE_MARKER,
            retryCount: 0,
            expected: CACHE_BASE,
        },
        {
            title: "doubles the cache wait the same way",
            message: CACHE_MARKER,
            retryCount: 2,
            expected: CACHE_BASE * 4,
        },
        {
            title: "caps a generic wait that would overshoot a minute",
            message: GENERIC,
            retryCount: 6,
            expected: CAP,
        },
        {
            title: "caps a cache wait that would overshoot a minute",
            message: CACHE_MARKER,
            retryCount: 3,
            expected: CAP,
        },
        {
            title: "holds the cap however long the streak runs",
            message: GENERIC,
            retryCount: 100,
            expected: CAP,
        },
    ])("$title", ({ message, retryCount, expected }) => {
        expect(computeRetryDelay(message, retryCount)).toBe(expected);
    });

    it("recognises the cache condition wherever it sits inside the message", () => {
        expect(
            computeRetryDelay(`Failed to fetch: ${CACHE_MARKER} (chunk 3)`, 0),
        ).toBe(CACHE_BASE);
    });

    it("treats a message that merely mentions a cache as an ordinary failure", () => {
        expect(computeRetryDelay("cache miss", 0)).toBe(GENERIC_BASE);
    });
});

describe("the retry lifecycle", () => {
    it("schedules the first attempt one base delay out", () => {
        const node = cachedNode("1-0-0-0");

        scheduleRetry(node, GENERIC, NOW);

        expect(node.retryAt).toBe(NOW + GENERIC_BASE);
    });

    it("keeps the message, which decides how far out the next attempt sits", () => {
        const node = cachedNode("1-0-0-0");

        scheduleRetry(node, GENERIC, NOW);

        expect(node.error).toBe(GENERIC);
    });

    it("pushes each further failure twice as far out as the last", () => {
        const node = cachedNode("1-0-0-0");
        const waits: number[] = [];

        for (let attempt = 0; attempt < 3; attempt++) {
            scheduleRetry(node, GENERIC, NOW);
            waits.push((node.retryAt ?? 0) - NOW);
        }

        expect(waits).toEqual([
            GENERIC_BASE,
            GENERIC_BASE * 2,
            GENERIC_BASE * 4,
        ]);
    });

    it("starts the backoff over after a success, so one bad moment does not follow the tile around", () => {
        const node = cachedNode("1-0-0-0");
        scheduleRetry(node, GENERIC, NOW);
        scheduleRetry(node, GENERIC, NOW);

        clearRetryState(node);
        scheduleRetry(node, GENERIC, NOW);

        expect(node.retryAt).toBe(NOW + GENERIC_BASE);
    });

    it("leaves no stale schedule behind for the enqueue guards to read", () => {
        const node = cachedNode("1-0-0-0");
        scheduleRetry(node, GENERIC, NOW);

        clearRetryState(node);

        expect(node.retryAt).toBeUndefined();
        expect(node.retryCount).toBeUndefined();
    });
});
