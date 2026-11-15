import { describe, expect, it } from "vitest";
import type maplibregl from "maplibre-gl";
import {
    buildMapViewState,
    translatedPlaneDistance,
} from "./viewportState";

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

describe("translatedPlaneDistance", () => {
    it("keeps the plane for a zero offset", () => {
        expect(
            translatedPlaneDistance(-12.5, [0, 1, 0], [0, 0, 0]),
        ).toBe(-12.5);
    });

    it("adds the projection of the offset onto the normal", () => {
        // Only the component along the normal moves the plane.
        expect(
            translatedPlaneDistance(10, [0, 0, 1], [5, -7, 3]),
        ).toBe(13);
        expect(
            translatedPlaneDistance(10, [1, 0, 0], [0, 100, 100]),
        ).toBe(10);
        expect(
            translatedPlaneDistance(10, [0, -1, 0], [2, 4, 0]),
        ).toBe(6);
    });

    it("moves the inside half-space with the frustum", () => {
        // Inside test: normal · x ≤ distance. A point p inside the original
        // plane stays inside the translated one exactly when p + offset does.
        const normal = [0.6, 0, 0.8];
        const offset = [10, 0, -20];
        const distance = 5;
        const shifted = translatedPlaneDistance(distance, normal, offset);

        const dot = (a: readonly number[], b: readonly number[]) =>
            a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
        const point = [1, 0, 1];
        // point is inside; point + offset against the shifted plane:
        expect(dot(normal, [point[0]! + 10, 0, point[2]! - 20])).toBeLessThan(
            shifted + 1e-12,
        );
        // and the un-shifted point against the original plane:
        expect(dot(normal, point)).toBeLessThan(distance + 1e-12);
    });
});
