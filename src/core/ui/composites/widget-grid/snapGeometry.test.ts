import { describe, expect, it } from "vitest";
import type { LayoutItem } from "react-grid-layout/legacy";
import {
    applyDragSnap,
    calculateEdgeSnap,
    calculateRowHeight,
    computeActiveEdgeZones,
    type GridConfig,
} from "./snapGeometry";

const COLS = 12;
const ROWS = 20;
const GRID: GridConfig = {
    cols: COLS,
    rows: ROWS,
    defaultWidth: 3,
    defaultHeight: 4,
};

const item = (over: Partial<LayoutItem>): LayoutItem => ({
    i: "w",
    x: 3,
    y: 4,
    w: 4,
    h: 5,
    ...over,
});

describe("calculateRowHeight", () => {
    it("fits the rows into the container minus padding and margins", () => {
        const height = calculateRowHeight(1000, {
            margin: [8, 8],
            containerPadding: [10, 10],
            rows: 10,
        });
        // 1000 - 2*10 - 9*8 = 908; 908 / 10 = 90.8
        expect(height).toBeCloseTo(90.8);
    });
});

describe("calculateEdgeSnap (resize)", () => {
    it("stretches a vertically-centered widget to the right edge", () => {
        // Centered vertically: y + h/2 == rows/2 → y=7.5/h=5 → use y=7, h=6 (center 10)
        const snapped = calculateEdgeSnap(
            item({ x: 8, y: 7, w: 3, h: 6 }),
            item({ x: 8, y: 7, w: 4, h: 6 }),
            COLS,
            ROWS,
        );
        expect(snapped).not.toBeNull();
        expect(snapped?.w).toBe(COLS - 8);
        expect(snapped?.x).toBe(8);
    });

    it("returns null away from any edge", () => {
        expect(
            calculateEdgeSnap(
                item({ x: 3, y: 4, w: 4, h: 5 }),
                item({ x: 3, y: 4, w: 4, h: 5 }),
                COLS,
                ROWS,
            ),
        ).toBeNull();
    });

    it("does not snap at an edge when off-center on the cross axis", () => {
        // Near the right edge but centered horizontally irrelevant —
        // vertical centering is required for a right-edge snap.
        expect(
            calculateEdgeSnap(
                item({ x: 9, y: 1, w: 2, h: 5 }),
                item({ x: 9, y: 1, w: 3, h: 5 }),
                COLS,
                ROWS,
            ),
        ).toBeNull();
    });
});

describe("applyDragSnap (drag)", () => {
    it("a drop near the top edge becomes a full-width band of default height", () => {
        const snapped = applyDragSnap(item({ x: 5, y: 0, w: 4, h: 5 }), GRID);
        expect(snapped).toEqual({
            i: "w",
            x: 0,
            y: 0,
            w: COLS,
            h: GRID.defaultHeight,
        });
    });

    it("a drop near the bottom edge anchors to the bottom", () => {
        const snapped = applyDragSnap(item({ x: 5, y: 17, w: 4, h: 3 }), GRID);
        expect(snapped?.y).toBe(ROWS - GRID.defaultHeight);
        expect(snapped?.w).toBe(COLS);
    });

    it("a drop near the left edge becomes a full-height band of default width", () => {
        const snapped = applyDragSnap(item({ x: 0, y: 5, w: 4, h: 5 }), GRID);
        expect(snapped).toEqual({
            i: "w",
            x: 0,
            y: 0,
            w: GRID.defaultWidth,
            h: ROWS,
        });
    });

    it("a drop in the middle does not snap", () => {
        expect(applyDragSnap(item({ x: 5, y: 8, w: 4, h: 5 }), GRID)).toBeNull();
    });
});

describe("computeActiveEdgeZones", () => {
    it("highlights the top zone while dragging near the top", () => {
        expect(computeActiveEdgeZones(item({ x: 5, y: 0, w: 4, h: 5 }), GRID))
            .toEqual(new Set(["top"]));
    });

    it("highlights the right zone when only horizontally centered", () => {
        expect(computeActiveEdgeZones(item({ x: COLS - 1, y: 5, w: 1, h: 10 }), GRID))
            .toEqual(new Set(["right"]));
    });

    it("empty in the middle", () => {
        expect(
            computeActiveEdgeZones(item({ x: 5, y: 8, w: 4, h: 5 }), GRID),
        ).toEqual(new Set());
    });
});
