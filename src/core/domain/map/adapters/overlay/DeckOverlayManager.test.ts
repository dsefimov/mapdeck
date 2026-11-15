import { describe, expect, it } from "vitest";
import { WebMercatorViewport } from "@deck.gl/core";
import type maplibregl from "maplibre-gl";
import type { FrustumPlanes } from "@core/contracts";
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
        getTerrain: () => null,
        addControl: () => {},
        removeControl: () => {},
    } as unknown as maplibregl.Map;
}

/** The map with terrain enabled: MapLibre's camera is the flat camera
 * translated vertically by `elevation` meters (null while the DEM under
 * the center is absent, 0 while it is not loaded — both mean no lift). */
function fakeTerrainMap(elevation: number | null) {
    return {
        ...fakeMap(),
        getTerrain: () => ({ source: "dem" }),
        queryTerrainElevation: () => elevation,
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

describe("DeckOverlayManager terrain-aware camera", () => {
    const CENTER_ELEVATION = 300;

    function terrainManager(elevation: number | null) {
        const manager = new DeckOverlayManager();
        manager.attachToMap(fakeTerrainMap(elevation));
        return manager;
    }

    /** The kernel's inside test for a point against the four side planes. */
    function inSidePlanes(
        planes: FrustumPlanes,
        point: readonly number[],
    ): boolean {
        const EPS = 1e-9;
        for (const plane of [
            planes.left,
            planes.right,
            planes.top,
            planes.bottom,
        ]) {
            const [nx = 0, ny = 0, nz = 0] = plane.normal;
            if (
                nx * point[0]! + ny * point[1]! + nz * point[2]! - plane.distance >
                EPS
            ) {
                return false;
            }
        }
        return true;
    }

    it("keeps the flat camera and planes when terrain is off", () => {
        const flatPos = attachedManager().getCameraPosition()!;
        const flatPlanes = attachedManager().getFrustumPlanes()!;
        expect(flatPos[2]).toBeCloseTo(219.84, 1);

        const vp = attachedManager().getActiveViewport() as
            | WebMercatorViewport
            | null;
        expect(vp!.zoom).toBeCloseTo(16, 6);
        expect(flatPlanes.left.distance).toBeCloseTo(
            vp!.getFrustumPlanes().left.distance,
            12,
        );
    });

    it("degrades to the flat camera while the DEM is not loaded", () => {
        const flatPos = attachedManager().getCameraPosition()!;

        for (const reported of [null, 0] as const) {
            const pos = terrainManager(reported).getCameraPosition()!;
            expect(pos[0]).toBeCloseTo(flatPos[0], 9);
            expect(pos[1]).toBeCloseTo(flatPos[1], 9);
            expect(pos[2]).toBeCloseTo(flatPos[2], 9);
        }
    });

    it("translates the camera vertically by the center elevation", () => {
        const flat = attachedManager().getCameraPosition()!;
        const lifted = terrainManager(CENTER_ELEVATION).getCameraPosition()!;

        // MapLibre's terrain camera is the flat camera moved straight up:
        // same lng/lat (unlike a zoom-out, which shifts it horizontally at
        // pitch), altitude up by the elevation. The up direction is sampled
        // at the view center while the pitched camera sits a couple hundred
        // meters away, where meters-per-mercator-unit differs slightly —
        // hence centimeters of tolerance, not exact meters.
        expect(lifted[0]).toBeCloseTo(flat[0], 6);
        expect(lifted[1]).toBeCloseTo(flat[1], 6);
        expect(lifted[2]).toBeCloseTo(flat[2] + CENTER_ELEVATION, 1);
    });

    it("keeps every terrain point the real camera sees inside the frustum", () => {
        // MapLibre's camera model: a terrain point (lng, lat, e) is visible
        // exactly when the flat viewport puts (lng, lat, 0) — the point
        // lowered by the same translation the camera received — on screen.
        // Sample such points across the whole screen at pitch 45 and check
        // the translated frustum against the kernel's inside test.
        const manager = terrainManager(CENTER_ELEVATION);
        const viewport = manager.getActiveViewport()!;
        const planes = manager.getFrustumPlanes()!;
        const flatPlanes = attachedManager().getFrustumPlanes()!;

        let checked = 0;
        let flatMisses = 0;
        for (let sx = 40; sx < 800; sx += 60) {
            for (let sy = 40; sy < 600; sy += 60) {
                const [lng = 0, lat = 0] = viewport.unproject([sx, sy]);
                const point: number[] = [lng, lat, CENTER_ELEVATION];
                const common = viewport.projectPosition(point);

                expect(inSidePlanes(planes, common)).toBe(true);
                checked += 1;
                if (!inSidePlanes(flatPlanes, common)) {
                    flatMisses += 1;
                }
            }
        }

        expect(checked).toBeGreaterThanOrEqual(90);
        expect(flatMisses).toBeGreaterThan(0);
    });
});
