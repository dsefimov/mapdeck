import { describe, expect, it } from "vitest";
import { clampLayoutItem } from "./layout";

const COLS = 80;
const ROWS = 45;

describe("clampLayoutItem", () => {
    it("keeps an item already inside the grid untouched", () => {
        const item = { x: 10, y: 20, w: 30, h: 15 };

        expect(clampLayoutItem(item, COLS, ROWS)).toEqual(item);
    });

    it("caps width at the grid edge", () => {
        const clamped = clampLayoutItem(
            { x: 0, y: 0, w: 100, h: 15 },
            COLS,
            ROWS,
        );

        expect(clamped).toMatchObject({ w: COLS, h: 15 });
    });

    it("caps height at the grid edge", () => {
        const clamped = clampLayoutItem(
            { x: 0, y: 0, w: 30, h: 60 },
            COLS,
            ROWS,
        );

        expect(clamped).toMatchObject({ w: 30, h: ROWS });
    });

    it("trims an oversized height against the bottom edge, keeping y", () => {
        const clamped = clampLayoutItem(
            { x: 10, y: 30, w: 20, h: 40 },
            COLS,
            ROWS,
        );

        expect(clamped).toMatchObject({ x: 10, y: 30, w: 20, h: 15 });
        expect(clamped.y + clamped.h).toBe(ROWS);
    });

    it("trims an oversized width against the right edge, keeping x", () => {
        const clamped = clampLayoutItem(
            { x: 70, y: 5, w: 40, h: 10 },
            COLS,
            ROWS,
        );

        expect(clamped).toMatchObject({ x: 70, y: 5, w: 10, h: 10 });
        expect(clamped.x + clamped.w).toBe(COLS);
    });

    it("clamps position first when the item starts past the grid", () => {
        const clamped = clampLayoutItem(
            { x: 78, y: 44, w: 6, h: 6 },
            COLS,
            ROWS,
        );

        // Only two cells remain to the right/bottom of the anchor.
        expect(clamped).toEqual({ x: 78, y: 44, w: 2, h: 1 });
    });

    it("never returns a zero-size item even for a degenerate grid", () => {
        const clamped = clampLayoutItem({ x: 0, y: 0, w: 10, h: 10 }, 1, 1);

        expect(clamped).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    });
});
