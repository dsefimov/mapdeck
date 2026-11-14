// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { SelectionController } from "./SelectionController";
import type { SelectionControllerDeps } from "./SelectionController";
import { SelectionToolStore } from "./SelectionToolStore";
import {
    SelectionStore,
    type SelectionRecord,
} from "@core/common/selection";
import type { LayerNode } from "@core/contracts";

type Handler = (event: {
    point: { x: number; y: number };
    originalEvent: { button: number; buttons: number };
}) => void;

const mousedown = (x: number, y: number, button = 0) => ({
    point: { x, y },
    originalEvent: { button, buttons: 1 },
});
const mousemove = (x: number, y: number, buttons = 1) => ({
    point: { x, y },
    originalEvent: { button: 0, buttons },
});

function makeNode(id: string, visible = true): LayerNode {
    return { id, title: id, isVisible: visible } as unknown as LayerNode;
}

function deckPick(layerId: string, key: string) {
    return {
        layer: { id: layerId },
        object: { properties: { id: key } },
        index: 0,
    };
}

interface Harness {
    controller: SelectionController;
    toolStore: SelectionToolStore;
    selection: SelectionStore;
    mapHandlers: Map<string, Handler>;
    pickObjects: ReturnType<typeof vi.fn>;
    queryRenderedFeatures: ReturnType<typeof vi.fn>;
    getLayer: ReturnType<typeof vi.fn>;
    mapOff: ReturnType<typeof vi.fn>;
    canvas: HTMLCanvasElement;
    dragPan: { disable: ReturnType<typeof vi.fn>; enable: ReturnType<typeof vi.fn> };
}

function makeHarness(nodes: LayerNode[]): Harness {
    const toolStore = new SelectionToolStore();
    const selection = new SelectionStore();
    const mapHandlers = new Map<string, Handler>();
    const pickObjects = vi.fn((): unknown[] => []);
    const queryRenderedFeatures = vi.fn((): unknown[] => []);
    const getLayer = vi.fn((): unknown => undefined);
    const dragPan = { disable: vi.fn(), enable: vi.fn() };
    const canvas = window.document.createElement("canvas");

    const map = {
        on: vi.fn((event: string, listener: Handler) =>
            mapHandlers.set(event, listener),
        ),
        off: vi.fn(),
        dragPan,
        getLayer,
        getCanvas: () => canvas,
        queryRenderedFeatures,
    };

    const deps = {
        map,
        context: { layerTree: { allLayerNodes: nodes } },
        overlayManager: { pickObjects },
        toolStore,
        selection,
    } as unknown as SelectionControllerDeps;

    const controller = new SelectionController();
    controller.attach(deps);
    return {
        controller,
        toolStore,
        selection,
        mapHandlers,
        pickObjects,
        queryRenderedFeatures,
        getLayer,
        mapOff: map.off,
        canvas,
        dragPan,
    };
}

const click = (h: Harness, x: number, y: number): void => {
    h.mapHandlers.get("mousedown")!(mousedown(x, y));
    h.mapHandlers.get("mouseup")!(mousedown(x, y));
};

describe("SelectionController", () => {
    it("picks the target layer's features on a click with tolerance", () => {
        const h = makeHarness([makeNode("parcels")]);
        h.toolStore.setTargetLayer("parcels");
        h.pickObjects.mockReturnValue([
            deckPick("parcels", "p1"),
            deckPick("parcels", "p2"),
            deckPick("other-layer", "x"),
        ]);

        click(h, 10, 10);

        // A click is a small square: deck's pickObjects has no radius.
        expect(h.pickObjects).toHaveBeenCalledWith(
            5,
            5,
            undefined,
            { width: 10, height: 10 },
        );
        expect(h.selection.countFor("parcels")).toBe(2);
        expect(h.selection.hasStableIds("parcels")).toBe(true);
    });

    it("resolves suffixed render-unit layers to the target node", () => {
        const h = makeHarness([makeNode("parcels")]);
        h.toolStore.setTargetLayer("parcels");
        h.pickObjects.mockReturnValue([
            deckPick("parcels-incoming", "p1"),
            deckPick("parcel", "x"),
        ]);

        click(h, 5, 5);

        expect(h.selection.countFor("parcels")).toBe(1);
    });

    it("a drag turns into a rectangle pick on both channels", () => {
        const h = makeHarness([makeNode("parcels"), makeNode("tiles")]);
        h.toolStore.setTargetLayer("parcels");
        h.pickObjects.mockReturnValue([deckPick("parcels", "p1")]);

        h.mapHandlers.get("mousedown")!(mousedown(10, 20));
        h.mapHandlers.get("mousemove")!(mousemove(30, 60));
        expect(h.toolStore.dragRect).toEqual({
            x0: 10,
            y0: 20,
            x1: 30,
            y1: 60,
        });

        h.mapHandlers.get("mouseup")!(mousedown(30, 60));

        expect(h.pickObjects).toHaveBeenCalledWith(
            10,
            20,
            undefined,
            { width: 20, height: 40 },
        );
        expect(h.toolStore.dragRect).toBeNull();
        expect(h.selection.countFor("parcels")).toBe(1);
    });

    it("passes the rectangle corners to the native query too", () => {
        const h = makeHarness([makeNode("tiles")]);
        h.toolStore.setTargetLayer("tiles");
        h.getLayer.mockReturnValue({});

        h.mapHandlers.get("mousedown")!(mousedown(10, 20));
        h.mapHandlers.get("mousemove")!(mousemove(30, 60));
        h.mapHandlers.get("mouseup")!(mousedown(30, 60));

        expect(h.queryRenderedFeatures).toHaveBeenCalledWith(
            [
                [10, 20],
                [30, 60],
            ],
            { layers: ["tiles"] },
        );
    });

    it("a move below the click threshold stays a point pick", () => {
        const h = makeHarness([makeNode("parcels")]);
        h.toolStore.setTargetLayer("parcels");

        h.mapHandlers.get("mousedown")!(mousedown(10, 10));
        h.mapHandlers.get("mousemove")!(mousemove(12, 11));
        h.mapHandlers.get("mouseup")!(mousedown(12, 11));

        expect(h.pickObjects).toHaveBeenCalledWith(
            5,
            5,
            undefined,
            { width: 10, height: 10 },
        );
    });

    it("applies the panel mode to the shared selection", () => {
        const h = makeHarness([makeNode("parcels")]);
        h.toolStore.setTargetLayer("parcels");
        const first: SelectionRecord = { key: "feature-1", footprint: null };
        h.selection.applySelection("parcels", [first], "new");

        h.toolStore.setMode("add");
        h.pickObjects.mockReturnValue([deckPick("parcels", "2")]);
        click(h, 1, 1);
        expect(h.selection.countFor("parcels")).toBe(2);

        h.toolStore.setMode("remove");
        h.pickObjects.mockReturnValue([deckPick("parcels", "2")]);
        click(h, 1, 1);
        expect(h.selection.keysFor("parcels")).toEqual(new Set(["feature-1"]));
    });

    it("merges records from the native query and the deck pick", () => {
        const h = makeHarness([makeNode("tiles"), makeNode("cloud")]);
        h.toolStore.setTargetLayer("tiles");
        h.queryRenderedFeatures.mockReturnValue([
            { properties: { id: "n1" }, geometry: null },
        ]);
        h.pickObjects.mockReturnValue([deckPick("cloud", "c1")]);

        click(h, 2, 2);

        expect(h.queryRenderedFeatures).toHaveBeenCalled();
        expect(h.pickObjects).toHaveBeenCalled();
        // Only the target layer's records land, whichever channel served them.
        expect(h.selection.keysFor("tiles")).toEqual(new Set(["feature-n1"]));
        expect(h.selection.countFor("cloud")).toBe(0);
    });

    it("a mouseup outside the canvas aborts the gesture via window pointerup", () => {
        const h = makeHarness([makeNode("parcels")]);
        h.toolStore.setTargetLayer("parcels");

        h.mapHandlers.get("mousedown")!(mousedown(10, 20));
        h.mapHandlers.get("mousemove")!(mousemove(30, 60));
        window.dispatchEvent(new Event("pointerup"));

        expect(h.toolStore.dragRect).toBeNull();
        // The next plain click does not inherit the aborted rectangle.
        h.pickObjects.mockReturnValue([deckPick("parcels", "p1")]);
        click(h, 40, 40);
        expect(h.pickObjects).toHaveBeenLastCalledWith(
            35,
            35,
            undefined,
            { width: 10, height: 10 },
        );
    });

    it("a pointerup on the canvas passes through to the map's mouseup", () => {
        // Real browsers deliver window pointerup BEFORE canvas mouseup —
        // an on-canvas up must not abort the click it belongs to.
        const h = makeHarness([makeNode("parcels")]);
        h.toolStore.setTargetLayer("parcels");
        h.pickObjects.mockReturnValue([deckPick("parcels", "p1")]);

        h.mapHandlers.get("mousedown")!(mousedown(10, 10));
        const pointerOnCanvas = new Event("pointerup");
        Object.defineProperty(pointerOnCanvas, "target", {
            value: h.canvas,
        });
        window.dispatchEvent(pointerOnCanvas);
        h.mapHandlers.get("mouseup")!(mousedown(10, 10));

        expect(h.selection.countFor("parcels")).toBe(1);
    });

    it("a mousemove with the button already released voids the gesture", () => {
        const h = makeHarness([makeNode("parcels")]);
        h.toolStore.setTargetLayer("parcels");

        h.mapHandlers.get("mousedown")!(mousedown(10, 20));
        h.mapHandlers.get("mousemove")!(mousemove(30, 60, 0));

        expect(h.toolStore.dragRect).toBeNull();
    });

    it("ignores non-left buttons and invisible target layers", () => {
        const h = makeHarness([makeNode("hidden", false)]);
        h.toolStore.setTargetLayer("hidden");

        h.mapHandlers.get("mousedown")!(mousedown(1, 1, 2));
        h.mapHandlers.get("mouseup")!(mousedown(1, 1, 2));
        click(h, 1, 1);

        expect(h.pickObjects).not.toHaveBeenCalled();
        expect(h.queryRenderedFeatures).not.toHaveBeenCalled();
    });

    it("suspends map drag-pan while attached and unwires on detach", () => {
        const h = makeHarness([]);

        expect(h.dragPan.disable).toHaveBeenCalledTimes(1);

        h.mapHandlers.get("mousedown")!(mousedown(1, 1));
        h.controller.detach();

        expect(h.dragPan.enable).toHaveBeenCalledTimes(1);
        expect(h.toolStore.dragRect).toBeNull();
        for (const event of ["mousedown", "mousemove", "mouseup"]) {
            expect(h.mapOff).toHaveBeenCalledWith(event, expect.any(Function));
        }
    });
});
