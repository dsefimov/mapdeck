import { describe, expect, it } from "vitest";
import { clampMenuPosition } from "./clampMenuPosition";

const SIZE = { width: 200, height: 100, margin: 8 };
const VIEWPORT = { width: 1280, height: 720 };

describe("clampMenuPosition", () => {
    it("keeps a position that fits the viewport untouched", () => {
        const p = { x: 100, y: 100 };
        expect(clampMenuPosition(p, SIZE, VIEWPORT)).toEqual(p);
    });

    it("pulls a menu back inside when it would overflow the right edge", () => {
        const clamped = clampMenuPosition(
            { x: 1200, y: 100 },
            SIZE,
            VIEWPORT,
        );
        expect(clamped.x).toBe(VIEWPORT.width - SIZE.width - SIZE.margin);
        expect(clamped.y).toBe(100);
    });

    it("pulls a menu back inside when it would overflow the bottom edge", () => {
        const clamped = clampMenuPosition(
            { x: 100, y: 700 },
            SIZE,
            VIEWPORT,
        );
        expect(clamped.x).toBe(100);
        expect(clamped.y).toBe(VIEWPORT.height - SIZE.height - SIZE.margin);
    });

    it("clamps both axes independently", () => {
        const clamped = clampMenuPosition(
            { x: 1279, y: 719 },
            SIZE,
            VIEWPORT,
        );
        expect(clamped).toEqual({
            x: VIEWPORT.width - SIZE.width - SIZE.margin,
            y: VIEWPORT.height - SIZE.height - SIZE.margin,
        });
    });
});
