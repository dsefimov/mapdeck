import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type maplibregl from "maplibre-gl";
import type { Layer } from "@deck.gl/core";
import type { OverlayManager } from "@core/contracts";
import { Bbox } from "@core/lib/geo";
import type { PointCloudData, ProtocolRegistry } from "@core/contracts";
import { TechLayerStore } from "@core/domain/map";
import { VolumeMeasureController } from "./controller";

// Kilometre-scale geometry, like the real Autzen cloud — the volume grid
// is sized from the boundary extent, so degree-scale tests explode it.
const M = 0.0001; // ~11 m in degrees
const CLOUD: PointCloudData = {
    positions: new Float32Array([
        0, 0, 10, 10 * M, 0, 12, 10 * M, 10 * M, 14, 0, 10 * M, 11,
    ]),
    coordinateOrigin: [0, 0, 0],
    pointCount: 4,
    bounds: Bbox.fromCorners({
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 10 * M,
        maxY: 10 * M,
        maxZ: 20,
    }),
};

const cloudAdapter = {
    getLoadedData: () => CLOUD,
    getAllLoadedData: () => [CLOUD],
};

const protocols = {
    getAll: () => [{ getLayerAdapter: () => cloudAdapter }],
} as unknown as ProtocolRegistry;

const overlayManager = { pickObject: () => null } as unknown as OverlayManager<Layer>;

let win: { addEventListener: () => void; removeEventListener: () => void };
beforeEach(() => {
    win = { addEventListener: () => {}, removeEventListener: () => {} };
    vi.stubGlobal("window", win);
});
afterEach(() => vi.unstubAllGlobals());

const fakeMap = { on: vi.fn(), off: vi.fn() } as unknown as maplibregl.Map;

function createController() {
    const store = new TechLayerStore();
    const controller = new VolumeMeasureController(store);
    controller.attach({
        map: fakeMap,
        overlayManager,
        getPointCloudData: () => undefined,
        protocols,
        onEscape: () => {},
    });
    return { store, controller };
}

const p = (x: number, y: number) => ({ lng: x, lat: y, z: 0 });

describe("VolumeMeasureController", () => {
    it("attaches with a fresh polygon drawing", () => {
        const { store } = createController();
        expect(store.drawing?.kind).toBe("polygon");
    });

    it("a boundary with fewer than three points completes with no results", () => {
        const { store, controller } = createController();
        store.addPoint(p(0, 0));
        store.addPoint(p(1, 0));

        controller.completeBoundary();

        expect(controller.volume.isComplete).toBe(true);
        expect(controller.volume.measurements).toBeNull();
        expect(controller.volume.topSurface).toBeNull();
    });

    it("a valid boundary runs the full pipeline over the loaded cloud", () => {
        const { store, controller } = createController();
        store.addPoint(p(-M, -M));
        store.addPoint(p(11 * M, -M));
        store.addPoint(p(11 * M, 11 * M));
        store.addPoint(p(-M, 11 * M));

        controller.completeBoundary();

        const volume = controller.volume;
        expect(volume.isComplete).toBe(true);
        // All four cloud points sit inside the boundary square.
        expect(volume.insidePoints.foundCount).toBe(4);
        expect(volume.measurements).not.toBeNull();
        expect(volume.measurements?.cloudPointCount).toBe(4);
        expect(volume.topSurface).not.toBeNull();
    });

    it("resetOrEscape on a completed measurement restarts; reset clears everything", () => {
        const { store, controller } = createController();
        store.addPoint(p(-M, -M));
        store.addPoint(p(11 * M, -M));
        store.addPoint(p(11 * M, 11 * M));
        controller.completeBoundary();
        expect(controller.volume.isComplete).toBe(true);

        controller.resetOrEscape();
        expect(controller.volume.isComplete).toBe(false);
        expect(controller.volume.insidePoints.foundCount).toBe(0);

        controller.reset();
        expect(store.geometries).toHaveLength(0);
        expect(store.drawing?.kind).toBe("polygon");
        expect(controller.volume.measurements).toBeNull();
    });
});
