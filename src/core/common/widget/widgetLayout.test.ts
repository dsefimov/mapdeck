import { describe, expect, it } from "vitest";
import type { LayoutItem } from "react-grid-layout";
import type { StoredWidget } from "@core/contracts";
import { WIDGET_GRID_DEFAULT_SIZE } from "./layout";
import { createDefaultLayout, findFreePosition } from "./widgetLayout";

function item(spec: {
    i: string;
    x: number;
    y: number;
    w: number;
    h: number;
}): LayoutItem {
    return { ...spec };
}

function widget(size: StoredWidget["size"]): StoredWidget {
    return { size } as StoredWidget;
}

describe("findFreePosition", () => {
    it("places the first widget at the grid origin with its default size", () => {
        const found = findFreePosition(
            WIDGET_GRID_DEFAULT_SIZE,
            "w1",
            [],
        );

        expect(found).toMatchObject({
            i: "w1",
            x: 0,
            y: 0,
            w: WIDGET_GRID_DEFAULT_SIZE.defaultWidth,
            h: WIDGET_GRID_DEFAULT_SIZE.defaultHeight,
        });
    });

    it("scans by column first: the next slot sits right of a blocker", () => {
        const blocker = item({ i: "blocker", x: 0, y: 0, w: 20, h: 15 });

        const found = findFreePosition(
            WIDGET_GRID_DEFAULT_SIZE,
            "w1",
            [blocker],
        );

        expect(found).toMatchObject({ x: 20, y: 0 });
    });

    it("carries the size constraints onto the returned item", () => {
        const found = findFreePosition(
            WIDGET_GRID_DEFAULT_SIZE,
            "w1",
            [],
        );

        expect(found).toMatchObject({
            minW: WIDGET_GRID_DEFAULT_SIZE.minW,
            minH: WIDGET_GRID_DEFAULT_SIZE.minH,
            maxW: WIDGET_GRID_DEFAULT_SIZE.maxW,
            maxH: WIDGET_GRID_DEFAULT_SIZE.maxH,
        });
    });

    it("returns null when no free slot fits the widget", () => {
        const fullGrid = item({ i: "full", x: 0, y: 0, w: 80, h: 45 });

        expect(
            findFreePosition(WIDGET_GRID_DEFAULT_SIZE, "w1", [fullGrid]),
        ).toBeNull();
    });
});

describe("createDefaultLayout", () => {
    it("falls back to the catalog default size for an unknown widget", () => {
        const layout = createDefaultLayout("w1", [], () => undefined);

        expect(layout).toMatchObject({
            i: "w1",
            x: 0,
            y: 0,
            w: WIDGET_GRID_DEFAULT_SIZE.defaultWidth,
            h: WIDGET_GRID_DEFAULT_SIZE.defaultHeight,
        });
    });

    it("honours the widget definition's declared size", () => {
        const getWidget = () =>
            widget({
                defaultWidth: 10,
                defaultHeight: 8,
                minWidth: 4,
                minHeight: 4,
                maxWidth: 30,
                maxHeight: 20,
            });

        const layout = createDefaultLayout("w1", [], getWidget);

        expect(layout).toMatchObject({
            w: 10,
            h: 8,
            minW: 4,
            minH: 4,
            maxW: 30,
            maxH: 20,
        });
    });

    it("prefers a free position over the zero-position fallback", () => {
        const blocker = item({ i: "blocker", x: 0, y: 0, w: 20, h: 15 });

        const layout = createDefaultLayout(
            "w1",
            [blocker],
            () => undefined,
        );

        expect(layout).toMatchObject({ x: 20, y: 0 });
    });

    it("clamps the fallback dimensions into [min, max] on a full grid", () => {
        const fullGrid = item({ i: "full", x: 0, y: 0, w: 80, h: 45 });
        const getWidget = () =>
            widget({
                defaultWidth: 50,
                defaultHeight: 3,
                minWidth: 5,
                minHeight: 5,
                maxWidth: 40,
                maxHeight: 30,
            });

        const layout = createDefaultLayout("w1", [fullGrid], getWidget);

        expect(layout).toMatchObject({ x: 0, y: 0, w: 40, h: 5 });
    });
});
