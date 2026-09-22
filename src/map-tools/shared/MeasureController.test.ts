import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type maplibregl from "maplibre-gl";
import type { Layer } from "@deck.gl/core";
import type { OverlayManager } from "@core/contracts";
import { TechLayerStore } from "@core/domain/map";
import { MeasureController } from "./MeasureController";

function fakeMap() {
    const listeners = new Map<string, Array<(e: unknown) => void>>();
    return {
        on: vi.fn((event: string, fn: (e: unknown) => void) => {
            listeners.set(event, [...(listeners.get(event) ?? []), fn]);
        }),
        off: vi.fn((event: string, fn: (e: unknown) => void) => {
            const arr = listeners.get(event) ?? [];
            listeners.set(event, arr.filter((f) => f !== fn));
        }),
        fire: (event: string, payload: unknown) => {
            for (const fn of listeners.get(event) ?? []) fn(payload);
        },
        listenerCount: (event: string) => listeners.get(event)?.length ?? 0,
    };
}

const overlayManager = { pickObject: () => null } as unknown as OverlayManager<Layer>;

let win: ReturnType<typeof fakeWindow>;
beforeEach(() => {
    win = fakeWindow();
    vi.stubGlobal("window", win);
});
afterEach(() => vi.unstubAllGlobals());

function fakeWindow() {
    const listeners = new Map<string, Array<(e: unknown) => void>>();
    const w = {
        addEventListener: (type: string, fn: (e: unknown) => void) => {
            listeners.set(type, [...(listeners.get(type) ?? []), fn]);
        },
        removeEventListener: (type: string, fn: (e: unknown) => void) => {
            const arr = listeners.get(type) ?? [];
            listeners.set(type, arr.filter((f) => f !== fn));
        },
        press: (key: string) => {
            for (const fn of listeners.get("keydown") ?? []) {
                fn({ key, preventDefault: () => {}, ctrlKey: false });
            }
        },
        keydownCount: () => listeners.get("keydown")?.length ?? 0,
    };
    return w;
}


function clickEvent(x: number, y: number) {
    return {
        point: { x, y },
        lngLat: { lng: 30.1, lat: 60.2 },
    };
}

function createController() {
    const store = new TechLayerStore();
    const controller = new MeasureController(store, {
        layerPrefix: "ruler-test",
        drawingKind: "polyline",
    });
    return { store, controller };
}

describe("MeasureController", () => {
    it("attach wires listeners and starts a drawing; detach unwires", () => {
        const map = fakeMap();
        const { store, controller } = createController();
        const onEscape = vi.fn();

        controller.attach({
            map: map as unknown as maplibregl.Map,
            overlayManager,
            getPointCloudData: () => undefined,
            onEscape,
        });

        expect(store.drawing?.kind).toBe("polyline");
        expect(map.listenerCount("click")).toBe(1);
        expect(map.listenerCount("mousemove")).toBe(1);

        controller.detach();
        expect(map.listenerCount("click")).toBe(0);
        expect(map.listenerCount("mousemove")).toBe(0);
        // Detach is idempotent.
        expect(() => controller.detach()).not.toThrow();
    });

    it("a map click adds a point via the lngLat fallback", () => {
        const map = fakeMap();
        const { store, controller } = createController();
        controller.attach({
            map: map as unknown as maplibregl.Map,
            overlayManager,
            getPointCloudData: () => undefined,
            onEscape: () => {},
        });

        map.fire("click", clickEvent(10, 10));

        expect(store.drawing?.points).toHaveLength(1);
        expect(store.drawing?.points[0]).toMatchObject({
            lng: 30.1,
            lat: 60.2,
            z: 0,
        });
    });

    it("Escape outside edit mode closes the tool; inside it exits the mode", () => {
        const map = fakeMap();
        const { store, controller } = createController();
        const onEscape = vi.fn();
        controller.attach({
            map: map as unknown as maplibregl.Map,
            overlayManager,
            getPointCloudData: () => undefined,
            onEscape,
        });

        win.press("Escape");
        expect(onEscape).toHaveBeenCalledTimes(1);

        store.toggleEditMode();
        win.press("Escape");
        expect(onEscape).toHaveBeenCalledTimes(1);
        expect(store.editMode).toBe(false);
    });

    it("reset clears geometries and restarts the configured drawing", () => {
        const { store, controller } = createController();
        controller.ensureDrawing();
        store.addPoint({ lng: 1, lat: 2, z: 0 });

        controller.reset();

        expect(store.geometries).toHaveLength(0);
        expect(store.drawing?.points).toHaveLength(0);
        expect(store.drawing?.kind).toBe("polyline");
    });
});
