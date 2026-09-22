import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("delays the call until the quiet period passes", () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("restarts the timer on every call — only the last one fires", () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced("a");
        vi.advanceTimersByTime(60);
        debounced("b");
        vi.advanceTimersByTime(60);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(40);
        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith("b");
    });

    it("cancel drops the pending call", () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced.cancel?.();
        vi.advanceTimersByTime(200);

        expect(fn).not.toHaveBeenCalled();
    });

    it("cancel after firing is a no-op", () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        vi.advanceTimersByTime(100);
        debounced.cancel?.();
        vi.advanceTimersByTime(100);

        expect(fn).toHaveBeenCalledTimes(1);
    });
});
