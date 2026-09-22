import { describe, expect, it } from "vitest";
import { WebMercatorViewport } from "@deck.gl/core";
import type maplibregl from "maplibre-gl";
import { DeckOverlayManager } from "./DeckOverlayManager";

function fakeMap() {
    return {
        getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
        getCenter: () => ({ lng: 30.3, lat: 59.9 }),
        getZoom: () => 16,
        getBearing: () => 30,
        getPitch: () => 45,
        getPadding: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
        getRenderWorldCopies: () => true,
        getVerticalFieldOfView: () => 60,
        addControl: () => {},
        removeControl: () => {},
    } as unknown as maplibregl.Map;
}

function attachedManager() {
    const manager = new DeckOverlayManager();
    manager.attachToMap(fakeMap());
    return manager;
}

describe("DeckOverlayManager viewport access", () => {
    it("returns null before attach", () => {
        const manager = new DeckOverlayManager();
        expect(manager.getActiveViewport()).toBeNull();
        expect(manager.getCameraPosition()).toBeNull();
        expect(manager.getFrustumPlanes()).toBeNull();
    });

    it("builds the viewport from the live map camera and fovy", () => {
        const vp =
            attachedManager().getActiveViewport() as WebMercatorViewport | null;

        expect(vp).toBeInstanceOf(WebMercatorViewport);
        expect(vp!.longitude).toBeCloseTo(30.3, 6);
        expect(vp!.latitude).toBeCloseTo(59.9, 6);
        expect(vp!.zoom).toBeCloseTo(16, 6);
        expect(vp!.bearing).toBeCloseTo(30, 6);
        expect(vp!.pitch).toBeCloseTo(45, 6);
        expect(vp!.fovy).toBe(60);
    });

    it("reports the camera in lng/lat/altitude aligned with the viewport", () => {
        const manager = attachedManager();

        const pos = manager.getCameraPosition()!;
        expect(pos[0]).toBeCloseTo(30.3, 2);
        expect(pos[1]).toBeCloseTo(59.9, 2);
        expect(pos[2]).toBeCloseTo(219.84, 1);

        const vp = manager.getActiveViewport()!;
        const back = vp.projectPosition(pos);
        const [cx = 0, cy = 0, cz = 0] = vp.cameraPosition;
        expect(back[0]).toBeCloseTo(cx, 5);
        expect(back[1]).toBeCloseTo(cy, 5);
        expect(back[2]).toBeCloseTo(cz, 6);
    });

    it("returns six finite frustum planes", () => {
        const planes = attachedManager().getFrustumPlanes()!;
        for (const name of [
            "near",
            "far",
            "left",
            "right",
            "top",
            "bottom",
        ] as const) {
            const plane = planes[name];
            expect(Number.isFinite(plane.distance)).toBe(true);
            expect(plane.normal).toHaveLength(3);
        }
    });
});
