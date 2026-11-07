// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useDebounce } from "./useDebounce";

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("useDebounce", () => {
    it("fires once with the latest args after the delay", () => {
        vi.useFakeTimers();
        const cb = vi.fn<(...args: unknown[]) => void>();
        const { result } = renderHook(() => useDebounce(cb, 100));

        act(() => result.current.call("a"));
        act(() => result.current.call("b"));
        expect(result.current.isPending).toBe(true);
        expect(cb).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(100));

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith("b");
        expect(result.current.isPending).toBe(false);
    });

    it("flush invokes the callback immediately with the pending args", () => {
        vi.useFakeTimers();
        const cb = vi.fn<(...args: unknown[]) => void>();
        const { result } = renderHook(() => useDebounce(cb, 100));

        act(() => result.current.call("a"));
        act(() => result.current.flush());

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith("a");

        act(() => vi.advanceTimersByTime(200));
        expect(cb).toHaveBeenCalledTimes(1);
        expect(result.current.isPending).toBe(false);
    });

    it("cancel drops the pending call", () => {
        vi.useFakeTimers();
        const cb = vi.fn<(...args: unknown[]) => void>();
        const { result } = renderHook(() => useDebounce(cb, 100));

        act(() => result.current.call("a"));
        act(() => result.current.cancel());
        act(() => vi.advanceTimersByTime(200));

        expect(cb).not.toHaveBeenCalled();
        expect(result.current.isPending).toBe(false);
    });

    it("always invokes the latest callback version", () => {
        vi.useFakeTimers();
        const first = vi.fn<() => void>();
        const second = vi.fn<() => void>();
        const { result, rerender } = renderHook(
            ({ cb }) => useDebounce(cb, 100),
            { initialProps: { cb: first } },
        );

        act(() => result.current.call());
        rerender({ cb: second });
        act(() => vi.advanceTimersByTime(100));

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("cancels the pending call on unmount", () => {
        vi.useFakeTimers();
        const cb = vi.fn<(...args: unknown[]) => void>();
        const { result, unmount } = renderHook(() => useDebounce(cb, 100));

        act(() => result.current.call("a"));
        unmount();
        act(() => vi.advanceTimersByTime(200));

        expect(cb).not.toHaveBeenCalled();
    });

    it("flush after the timer fired does not re-invoke with stale args", () => {
        vi.useFakeTimers();
        const cb = vi.fn<(...args: unknown[]) => void>();
        const { result } = renderHook(() => useDebounce(cb, 100));

        act(() => result.current.call("a"));
        act(() => vi.advanceTimersByTime(100));
        expect(cb).toHaveBeenCalledTimes(1);

        act(() => result.current.flush());

        expect(cb).toHaveBeenCalledTimes(1);
    });

    it("applies a delay change to subsequent calls", () => {
        vi.useFakeTimers();
        const cb = vi.fn<(...args: unknown[]) => void>();
        const { result, rerender } = renderHook(
            ({ delay }) => useDebounce(cb, delay),
            { initialProps: { delay: 100 } },
        );

        rerender({ delay: 300 });
        act(() => result.current.call("a"));
        act(() => vi.advanceTimersByTime(100));
        expect(cb).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(200));
        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith("a");
    });
});
