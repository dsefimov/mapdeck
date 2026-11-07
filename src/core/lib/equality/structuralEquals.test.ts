import { describe, expect, it } from "vitest";

import { structuralEquals } from "./structuralEquals";

describe("structuralEquals — primitives", () => {
    it.each([
        ["equal numbers", 1, 1],
        ["equal strings", "a", "a"],
        ["both null", null, null],
        ["both undefined", undefined, undefined],
        ["NaN equals NaN", Number.NaN, Number.NaN],
    ])("%s", (_case, a, b) => {
        expect(structuralEquals(a, b)).toBe(true);
    });

    it.each([
        ["different numbers", 1, 2],
        ["different types", 1, "1"],
        ["number vs null", 0, null],
        ["null vs undefined", null, undefined],
    ])("%s", (_case, a, b) => {
        expect(structuralEquals(a, b)).toBe(false);
    });
});

describe("structuralEquals — objects and arrays", () => {
    it("compares flat objects key-wise regardless of order", () => {
        expect(structuralEquals({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    });

    it("is false on key-set mismatch in either direction", () => {
        expect(structuralEquals({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        expect(structuralEquals({ a: 1, b: 2 }, { a: 1 })).toBe(false);
        expect(
            structuralEquals({ a: 1 }, { b: 1 }),
        ).toBe(false);
    });

    it("distinguishes an absent key from an undefined value", () => {
        expect(structuralEquals({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    });

    it("compares nested structures deeply", () => {
        const a = { style: { opacity: 0.5, paint: ["x", "y"] } };
        const b = { style: { opacity: 0.5, paint: ["x", "y"] } };
        expect(structuralEquals(a, b)).toBe(true);
    });

    it("is false when a nested value differs", () => {
        const a = { style: { opacity: 0.5 } };
        const b = { style: { opacity: 0.6 } };
        expect(structuralEquals(a, b)).toBe(false);
    });

    it("compares arrays element-wise and order-sensitively", () => {
        expect(structuralEquals([1, [2, 3]], [1, [2, 3]])).toBe(true);
        expect(structuralEquals([1, 2], [2, 1])).toBe(false);
        expect(structuralEquals([1], [1, 2])).toBe(false);
    });
});

describe("structuralEquals — special object kinds", () => {
    it("compares Dates by time value", () => {
        expect(
            structuralEquals(new Date(1000), new Date(1000)),
        ).toBe(true);
        expect(
            structuralEquals(new Date(1000), new Date(2000)),
        ).toBe(false);
    });

    it("does not equate a Date with a same-valued string or number", () => {
        expect(structuralEquals(new Date(0), new Date(0).toISOString())).toBe(
            false,
        );
        expect(structuralEquals(new Date(0), 0)).toBe(false);
    });

});

describe("structuralEquals — kind mismatches and built-ins", () => {
    it("does not equate an array with an object", () => {
        expect(structuralEquals([], {})).toBe(false);
        expect(structuralEquals([1], { 0: 1 })).toBe(false);
    });

    it("does not equate a Date with a plain object", () => {
        expect(structuralEquals(new Date(0), {})).toBe(false);
    });

    it("compares Map, Set and RegExp by identity only", () => {
        expect(structuralEquals(new Map([[1, 2]]), new Map())).toBe(false);
        expect(structuralEquals(new Set([1]), new Set())).toBe(false);
        expect(structuralEquals(/a/, /b/)).toBe(false);
        expect(structuralEquals(/a/, /a/)).toBe(false);
    });

    it("compares class instances by identity only", () => {
        class Point {
            constructor(
                readonly x: number,
                readonly y: number,
            ) {}
        }
        expect(structuralEquals(new Point(1, 2), { x: 1, y: 2 })).toBe(false);
        const same = new Point(1, 2);
        expect(structuralEquals(same, same)).toBe(true);
    });

    it("compares null-prototype objects structurally", () => {
        const a = Object.assign(Object.create(null), { x: 1 });
        const b = Object.assign(Object.create(null), { x: 1 });
        expect(structuralEquals(a, b)).toBe(true);
    });

    it("does not structurally compare objects with custom prototypes", () => {
        expect(structuralEquals({}, Object.create({ x: 1 }))).toBe(false);
    });

    it("distinguishes 0 from -0", () => {
        expect(structuralEquals(0, -0)).toBe(false);
    });
});
