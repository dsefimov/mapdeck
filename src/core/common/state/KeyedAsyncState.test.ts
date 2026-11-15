import { describe, expect, it } from "vitest";
import { KeyedAsyncState } from "./KeyedAsyncState";

const resolveAfter = <T>(value: T, ms = 5): Promise<T> =>
    new Promise((resolve) => setTimeout(() => resolve(value), ms));

const rejectAfter = (message: string, ms = 5): Promise<never> =>
    new Promise((_, reject) =>
        setTimeout(() => reject(new Error(message)), ms),
    );

describe("KeyedAsyncState", () => {
    it("isolates status and error per key", async () => {
        const state = new KeyedAsyncState<string>();
        const pendingA = state.run("a", () => resolveAfter("a", 20));
        await state.run("b", () => rejectAfter("b failed")).catch(
            () => undefined,
        );

        expect(state.get("a").status).toBe("loading");
        expect(state.get("b").status).toBe("error");
        expect(state.get("b").error).toBe("b failed");
        expect(state.get("a").error).toBeNull();
        await pendingA;
    });

    it("aggregate loading reports true when any operation is loading", async () => {
        const state = new KeyedAsyncState<string>();
        const pending = state.run("a", () => resolveAfter("a", 20));
        expect(state.isLoading()).toBe(true);
        await pending;
        expect(state.isLoading()).toBe(false);
    });

    it("per-key loading query reports only that key", async () => {
        const state = new KeyedAsyncState<string>();
        state.run("a", () => resolveAfter("a", 20));
        expect(state.isLoading("a")).toBe(true);
        expect(state.isLoading("b")).toBe(false);
        expect(state.isLoading()).toBe(true);
    });

    it("run creates the key's state on first use", () => {
        const state = new KeyedAsyncState<string>();
        expect(state.get("a").status).toBe("idle");
    });

    it("reset discards a key's state", async () => {
        const state = new KeyedAsyncState<string>();
        await state.run("a", () => rejectAfter("boom")).catch(() => undefined);
        state.reset("a");
        expect(state.get("a").status).toBe("idle");
        expect(state.get("a").error).toBeNull();
    });
});
