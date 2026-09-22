import { describe, expect, it, afterEach, vi } from "vitest";
import type { GeoPoint } from "@core/lib/geo";
import { TechLayerStore } from "./TechLayerStore";

const p = (lng: number, lat: number, z = 0): GeoPoint => ({ lng, lat, z });

const createStore = () => new TechLayerStore();

describe("TechLayerStore", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("draws and commits a geometry", () => {
        const store = createStore();
        store.startDrawing("polygon");
        store.addPoint(p(0, 0));
        store.addPoint(p(1, 0));
        store.commitDrawing();

        expect(store.drawing).toBeNull();
        expect(store.geometries).toHaveLength(1);
        expect(store.geometries[0]!.kind).toBe("polygon");
        expect(store.geometries[0]!.points).toHaveLength(2);
    });

    it("appends and removes points while drawing", () => {
        const store = createStore();
        store.startDrawing("polyline");
        store.addPoint(p(0, 0));
        store.addPoint(p(1, 1));
        expect(store.drawing!.points).toHaveLength(2);

        store.removeLastPoint();
        expect(store.drawing!.points).toHaveLength(1);
        expect(store.drawing!.points[0]).toEqual(p(0, 0));
    });

    it("ignores addPoint without an active drawing", () => {
        const store = createStore();
        store.addPoint(p(0, 0));
        expect(store.drawing).toBeNull();
        expect(store.geometries).toHaveLength(0);
    });

    it("removes a completed geometry by id", () => {
        const store = createStore();
        store.startDrawing("point");
        store.addPoint(p(0, 0));
        store.commitDrawing();
        const id = store.geometries[0]!.id;

        store.removeGeometry(id);
        expect(store.geometries).toHaveLength(0);
    });

    it("moves a node inside a geometry", () => {
        const store = createStore();
        store.startDrawing("polyline");
        store.addPoint(p(0, 0));
        store.addPoint(p(1, 1));
        store.commitDrawing();
        const id = store.geometries[0]!.id;

        store.moveNode(id, 0, p(9, 9));
        expect(store.geometries[0]!.points[0]).toEqual(p(9, 9));
        expect(store.geometries[0]!.points[1]).toEqual(p(1, 1));
    });

    it("moves a node inside the active drawing", () => {
        const store = createStore();
        store.startDrawing("polyline");
        store.addPoint(p(0, 0));
        store.addPoint(p(1, 1));

        store.moveNode(store.drawing!.id, 1, p(5, 5));
        expect(store.drawing!.points[1]).toEqual(p(5, 5));
    });

    it("isolates per-instance state", () => {
        const a = new TechLayerStore();
        const b = new TechLayerStore();
        a.startDrawing("point");
        a.addPoint(p(0, 0));
        a.commitDrawing();

        expect(a.geometries).toHaveLength(1);
        expect(b.geometries).toHaveLength(0);
    });

    it("resets all state", () => {
        const store = createStore();
        store.startDrawing("point");
        store.addPoint(p(0, 0));
        store.commitDrawing();
        store.setPreviewPoint(p(1, 1));
        store.toggleEditMode();

        store.reset();
        expect(store.geometries).toHaveLength(0);
        expect(store.drawing).toBeNull();
        expect(store.previewPoint).toBeNull();
        expect(store.editMode).toBe(false);
    });
});
