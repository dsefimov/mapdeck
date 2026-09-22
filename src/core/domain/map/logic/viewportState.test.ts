import { describe, expect, it } from "vitest";
import type maplibregl from "maplibre-gl";
import { buildMapViewState } from "./viewportState";

function fakeMap(lng: number, lat: number) {
    return {
        getCenter: () => ({ lng, lat }),
        getZoom: () => 16,
        getBearing: () => 30,
        getPitch: () => 45,
        getPadding: () => ({ top: 10, bottom: 20, left: 30, right: 40 }),
        getRenderWorldCopies: () => true,
    } as unknown as maplibregl.Map;
}

describe("buildMapViewState", () => {
    it("mirrors the map camera state", () => {
        const state = buildMapViewState(fakeMap(30.3, 59.9));
        expect(state.longitude).toBeCloseTo(30.3, 10);
        expect(state.latitude).toBe(59.9);
        expect(state.zoom).toBe(16);
        expect(state.bearing).toBe(30);
        expect(state.pitch).toBe(45);
        expect(state.padding).toEqual({
            top: 10,
            bottom: 20,
            left: 30,
            right: 40,
        });
        expect(state.repeat).toBe(true);
    });

    it("wraps longitude into [-180, 180) like deck.gl", () => {
        expect(buildMapViewState(fakeMap(190, 0)).longitude).toBe(-170);
        expect(buildMapViewState(fakeMap(-190, 0)).longitude).toBe(170);
    });
});
