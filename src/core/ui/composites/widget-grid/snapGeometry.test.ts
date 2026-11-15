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
    margin: [8, 8],
    containerPadding: [8, 8],
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
            ...GRID,
            rows: 10,
            margin: [8, 8],
            containerPadding: [10, 10],
        });
        // 1000 - 2*10 - 9*8 = 908; 908 / 10 = 90.8
        expect(height).toBeCloseTo(90.8);
    });
});

describe("calculateEdgeSnap (resize) — the app enables only the se handle, so left/top snaps are unreachable", () => {
    it.each([
        {
            edge: "right",
            resized: { x: 8, y: 7, w: 3, h: 6 },
            before: { x: 8, y: 7, w: 2, h: 6 },
            patch: { w: COLS - 8 },
        },
        {
            edge: "bottom",
            resized: { x: 4, y: 15, w: 4, h: 4 },
            before: { x: 4, y: 15, w: 4, h: 3 },
            patch: { h: ROWS - 15 },
        },
    ])("stretches a cross-axis-centered widget to the $edge edge", ({
        resized,
        before,
        patch,
    }) => {
        expect(calculateEdgeSnap(item(resized), item(before), COLS, ROWS))
            .toEqual({ ...item(resized), ...patch });
    });

    it.each([
        {
            edge: "right",
            resized: { x: 9, y: 1, w: 2, h: 5 },
            before: { x: 9, y: 1, w: 3, h: 5 },
        },
        {
            edge: "bottom",
            resized: { x: 0, y: 15, w: 2, h: 4 },
            before: { x: 0, y: 15, w: 2, h: 3 },
        },
    ])("returns null at the $edge edge when off-center on the cross axis", ({
        resized,
        before,
    }) => {
        expect(
            calculateEdgeSnap(item(resized), item(before), COLS, ROWS),
        ).toBeNull();
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

    it("does not re-snap a widget already stretched to the edge", () => {
        expect(
            calculateEdgeSnap(
                item({ x: 8, y: 7, w: 4, h: 6 }),
                item({ x: 8, y: 7, w: 4, h: 6 }),
                COLS,
                ROWS,
            ),
        ).toBeNull();
    });
});

describe("applyDragSnap (drag)", () => {
    it.each([
        {
            edge: "top",
            dropped: { x: 5, y: 0, w: 4, h: 5 },
            band: { x: 0, y: 0, w: COLS, h: GRID.defaultHeight },
        },
        {
            edge: "bottom",
            dropped: { x: 5, y: 17, w: 4, h: 3 },
            band: {
                x: 0,
                y: ROWS - GRID.defaultHeight,
                w: COLS,
                h: GRID.defaultHeight,
            },
        },
        {
            edge: "left",
            dropped: { x: 0, y: 5, w: 4, h: 5 },
            band: { x: 0, y: 0, w: GRID.defaultWidth, h: ROWS },
        },
        {
            edge: "right",
            dropped: { x: 9, y: 5, w: 3, h: 5 },
            band: {
                x: COLS - GRID.defaultWidth,
                y: 0,
                w: GRID.defaultWidth,
                h: ROWS,
            },
        },
    ])("a drop near the $edge edge becomes a band", ({ dropped, band }) => {
        expect(applyDragSnap(item(dropped), GRID)).toEqual({
            ...item(dropped),
            ...band,
        });
    });

    it.each([
        { case: "a drop in the middle", dropped: { x: 5, y: 8, w: 4, h: 5 } },
        {
            case: "an already full-width band at the top",
            dropped: { x: 0, y: 0, w: COLS, h: 5 },
        },
        {
            case: "an already full-height band on the left",
            dropped: { x: 0, y: 0, w: GRID.defaultWidth, h: ROWS },
        },
    ])("no snap for $case", ({ dropped }) => {
        expect(applyDragSnap(item(dropped), GRID)).toBeNull();
    });

    it("a drop near a corner takes the horizontal band, not the vertical one", () => {
        expect(applyDragSnap(item({ x: 1, y: 7, w: 4, h: 12 }), GRID)).toEqual({
            ...item({ x: 1, y: 7, w: 4, h: 12 }),
            x: 0,
            y: ROWS - GRID.defaultHeight,
            w: COLS,
            h: GRID.defaultHeight,
        });
    });
});

describe("computeActiveEdgeZones", () => {
    it.each([
        { edge: "top", dragged: { x: 5, y: 0, w: 4, h: 5 } },
        { edge: "bottom", dragged: { x: 5, y: 17, w: 4, h: 3 } },
        { edge: "left", dragged: { x: 0, y: 5, w: 4, h: 5 } },
        { edge: "right", dragged: { x: COLS - 1, y: 5, w: 1, h: 10 } },
    ])("highlights the $edge zone while dragging near it", ({
        dragged,
        edge,
    }) => {
        expect(computeActiveEdgeZones(item(dragged), GRID)).toEqual(
            new Set([edge]),
        );
    });

    it("a corner drop highlights only the horizontal zone", () => {
        expect(
            computeActiveEdgeZones(item({ x: 1, y: 7, w: 4, h: 12 }), GRID),
        ).toEqual(new Set(["bottom"]));
    });

    it("empty in the middle", () => {
        expect(
            computeActiveEdgeZones(item({ x: 5, y: 8, w: 4, h: 5 }), GRID),
        ).toEqual(new Set());
    });
});
