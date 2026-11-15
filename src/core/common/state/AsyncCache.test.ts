import { computed, configure } from "mobx";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AsyncCache } from "./AsyncCache";

// Reproduce production MobX strictness (src/app/mobxConfig.ts), which the
// test runner would otherwise not apply.
configure({ enforceActions: "always" });

afterEach(() => {
    vi.useRealTimers();
});

describe("AsyncCache", () => {
    it("returns a fresh entry via get", () => {
        const cache = new AsyncCache<string, number>({ ttl: 1000 });
        cache.set("a", 1);
        expect(cache.get("a")).toBe(1);
    });

    it("returns undefined for an expired entry", () => {
        vi.useFakeTimers();
        const cache = new AsyncCache<string, number>({ ttl: 100 });
        cache.set("a", 1);
        vi.advanceTimersByTime(101);
        expect(cache.get("a")).toBeUndefined();
        expect(cache.get("a")).toBeUndefined();
    });

    it("does not mutate state on an expired read", () => {
        vi.useFakeTimers();
        const cache = new AsyncCache<string, number>({ ttl: 100 });
        cache.set("a", 1);
        vi.advanceTimersByTime(101);

        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(cache.get("a")).toBeUndefined();
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it("is safe to read inside a computed", () => {
        vi.useFakeTimers();
        const cache = new AsyncCache<string, number>({ ttl: 100 });
        cache.set("a", 1);
        vi.advanceTimersByTime(101);

        const value = computed(() => cache.get("a"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        expect(value.get()).toBeUndefined();
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it("honours a per-entry ttl override", () => {
        vi.useFakeTimers();
        const cache = new AsyncCache<string, number>({ ttl: 1000 });
        cache.set("a", 1, { ttl: 100 });
        vi.advanceTimersByTime(101);
        expect(cache.get("a")).toBeUndefined();
    });

    it("stores the fetched value and clears loading", async () => {
        const cache = new AsyncCache<string, number>({ ttl: 1000 });
        const result = await cache.fetch("a", async () => 42);
        expect(result).toBe(42);
        expect(cache.get("a")).toBe(42);
        expect(cache.isLoading("a")).toBe(false);
    });

    it("passes the previous value to the loader", async () => {
        const cache = new AsyncCache<string, number[]>({ ttl: 1000 });
        await cache.fetch("a", async () => [1]);
        const seen: number[] | undefined = await cache.fetch(
            "a",
            async (prev) => [...(prev ?? []), 2],
        );
        expect(seen).toEqual([1, 2]);
        expect(cache.get("a")).toEqual([1, 2]);
    });

    it("keeps the previous value after a failed fetch and expires by errorTtl", async () => {
        vi.useFakeTimers();
        const cache = new AsyncCache<string, number>({
            ttl: 10000,
            errorTtl: 100,
        });
        await cache.fetch("a", async () => 1);

        await expect(
            cache.fetch("a", async () => Promise.reject(new Error("boom"))),
        ).rejects.toThrow("boom");
        expect(cache.get("a")).toBe(1);
        expect(cache.getError("a")).toBe("boom");

        vi.advanceTimersByTime(101);
        expect(cache.get("a")).toBeUndefined();
    });

    it("anchors errorTtl to the last failed fetch, not the last success", async () => {
        vi.useFakeTimers();
        const cache = new AsyncCache<string, number>({
            ttl: 10000,
            errorTtl: 100,
        });
        await cache.fetch("a", async () => 1);

        // The success is already older than errorTtl — the failure is fresh.
        vi.advanceTimersByTime(5000);
        await expect(
            cache.fetch("a", async () => Promise.reject(new Error("boom"))),
        ).rejects.toThrow("boom");

        vi.advanceTimersByTime(50);
        expect(cache.get("a")).toBe(1);

        vi.advanceTimersByTime(51);
        expect(cache.get("a")).toBeUndefined();
    });

    it("settles loading without an error when aborted", async () => {
        const cache = new AsyncCache<string, number>({ ttl: 1000 });
        const controller = new AbortController();
        const promise = cache.fetch(
            "a",
            async () => {
                throw new DOMException("aborted", "AbortError");
            },
            { signal: controller.signal },
        );
        controller.abort();
        await expect(promise).rejects.toThrow();
        expect(cache.isLoading("a")).toBe(false);
        expect(cache.getError("a")).toBeNull();
    });

    it("clears an error while keeping the value", async () => {
        const cache = new AsyncCache<string, number>({ ttl: 1000 });
        await cache.fetch("a", async () => 1);
        await expect(
            cache.fetch("a", async () => Promise.reject(new Error("boom"))),
        ).rejects.toThrow("boom");
        expect(cache.getError("a")).toBe("boom");

        cache.clearError("a");

        expect(cache.getError("a")).toBeNull();
        expect(cache.get("a")).toBe(1);
    });

    it("clearError on an absent key is a no-op", () => {
        const cache = new AsyncCache<string, number>({ ttl: 1000 });
        expect(() => cache.clearError("missing")).not.toThrow();
    });

    it("invalidates a single key", async () => {
        const cache = new AsyncCache<string, number>({ ttl: 1000 });
        cache.set("a", 1);
        cache.set("b", 2);
        cache.invalidate("a");
        expect(cache.get("a")).toBeUndefined();
        expect(cache.get("b")).toBe(2);
    });

    it("clears all entries", async () => {
        const cache = new AsyncCache<string, number>({ ttl: 1000 });
        cache.set("a", 1);
        cache.set("b", 2);
        cache.clear();
        expect(cache.get("a")).toBeUndefined();
        expect(cache.get("b")).toBeUndefined();
    });

    it("evicts the oldest entry when maxSize is exceeded", () => {
        const cache = new AsyncCache<string, number>({ ttl: 1000, maxSize: 2 });
        cache.set("a", 1);
        cache.set("b", 2);
        cache.set("c", 3);
        expect(cache.get("a")).toBeUndefined();
        expect(cache.get("b")).toBe(2);
        expect(cache.get("c")).toBe(3);
    });
});
