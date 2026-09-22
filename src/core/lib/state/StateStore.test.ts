import { describe, expect, it, vi } from "vitest";
import { StateStore } from "./StateStore";

interface StubState {
    value: number;
}

const makeStub = (value: number): StubState => ({ value });

describe("StateStore", () => {
    it("creates state via factory on first access", () => {
        const store = new StateStore();
        const created = store.get("my-widget", () => makeStub(1));
        expect(created).toEqual({ value: 1 });
    });

    it("returns the same instance on subsequent access without re-invoking the factory", () => {
        const store = new StateStore();
        const first = store.get("my-widget", () => makeStub(1));
        let factoryCalls = 0;
        const second = store.get("my-widget", () => {
            factoryCalls += 1;
            return makeStub(2);
        });
        expect(second).toBe(first);
        expect(factoryCalls).toBe(0);
    });

    it("removes state so the next access creates a fresh instance", () => {
        const store = new StateStore();
        const first = store.get("my-widget", () => makeStub(1));
        store.remove("my-widget");
        const second = store.get("my-widget", () => makeStub(2));
        expect(second).not.toBe(first);
        expect(second).toEqual({ value: 2 });
    });

    it("has reports key existence", () => {
        const store = new StateStore();
        store.get("my-widget", () => makeStub(1));
        expect(store.has("my-widget")).toBe(true);
        expect(store.has("unknown")).toBe(false);
    });

    it("peek reads existing state without creating it", () => {
        const store = new StateStore();
        expect(store.peek("k")).toBeUndefined();

        const instance = makeStub(7);
        store.get("k", () => instance);
        expect(store.peek("k")).toBe(instance);
    });

    it("returns the exact factory instance, untransformed", () => {
        const store = new StateStore();
        const instance = makeStub(42);
        expect(store.get("k", () => instance)).toBe(instance);
    });
});

describe("StateStore disposal", () => {
    it("disposes entries that hold resources and clears the container (ADR-0003)", () => {
        const store = new StateStore();
        const dispose = vi.fn();
        store.get("resourceful", () => ({ dispose }));
        store.get("plain", () => makeStub(1));

        store.dispose();

        expect(dispose).toHaveBeenCalledTimes(1);
        expect(store.has("resourceful")).toBe(false);
        expect(store.has("plain")).toBe(false);
    });

    it("dispose is safe on an empty container and twice in a row", () => {
        const store = new StateStore();
        expect(() => {
            store.dispose();
            store.dispose();
        }).not.toThrow();
    });
});
