import { describe, expect, it, vi } from "vitest";
import proj4 from "proj4";
import type {
    ProcessRequest,
    RecolorRequest,
} from "./pointProcessing.types";
import { process, recolor } from "./pointProcessing.worker";

// The worker module registers self.onmessage at import time; node has no
// `self`, so alias it to globalThis before the module evaluates.
vi.hoisted(() => {
    (globalThis as unknown as { self: unknown }).self = globalThis;
});

/**
 * A real projected CRS: the WKT path must go through proj4 exactly like the
 * main-thread transformer does.
 */
const UTM33N_WKT =
    'PROJCS["WGS 84 / UTM zone 33N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",15],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AUTHORITY["EPSG","32633"]]';

/** Same CRS defined as a proj string — the independent expectation source. */
const utm33nToWgs84 = proj4(
    "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs",
    "EPSG:4326",
);

function request(overrides: Partial<ProcessRequest> = {}): ProcessRequest {
    return {
        kind: "process",
        requestId: "r1",
        pointCount: 2,
        rawX: Float64Array.from([10, 20]),
        rawY: Float64Array.from([30, 40]),
        rawZ: Float32Array.from([100, 200]),
        rawIntensity: Uint16Array.from([65535, 32767]),
        rawClassification: Uint8Array.from([2, 12]),
        rawR: null,
        rawG: null,
        rawB: null,
        hasColor: false,
        wkt: null,
        coordinateOrigin: [10, 30, 0],
        globalBounds: null,
        ...overrides,
    };
}

function recolorRequest(
    overrides: Partial<RecolorRequest> = {},
): RecolorRequest {
    return {
        kind: "recolor",
        requestId: "rc1",
        scheme: "intensity",
        intensities: Float32Array.from([1, 0.5]),
        classifications: Uint8Array.from([2, 12]),
        heights: Float32Array.from([100, 200]),
        globalBounds: [0, 0, 100, 0, 0, 200],
        ...overrides,
    };
}

describe("point processing worker", () => {
    it("echoes the request id", () => {
        expect(process(request({ requestId: "req-9" })).requestId).toBe(
            "req-9",
        );
    });

    it("lays a geographic cloud out relative to the origin, heights untouched", () => {
        const result = process(request());

        expect([...result.positions]).toEqual([0, 0, 100, 10, 10, 200]);
    });

    it("reprojects a projected cloud through its WKT before shifting", () => {
        const utm = { x: 500_000, y: 5_000_000 };
        const [lng, lat] = utm33nToWgs84.forward([
            utm.x,
            utm.y,
        ]) as [number, number];
        const result = process(
            request({
                pointCount: 1,
                rawX: Float64Array.from([utm.x]),
                rawY: Float64Array.from([utm.y]),
                rawZ: Float32Array.from([7]),
                wkt: UTM33N_WKT,
                coordinateOrigin: [0, 0, 0],
            }),
        );

        expect(result.positions[0]).toBeCloseTo(lng, 5);
        expect(result.positions[1]).toBeCloseTo(lat, 5);
        expect(result.positions[2]).toBe(7);
    });

    it("scales intensities into the unit range", () => {
        const result = process(request());

        expect(result.intensities[0]).toBeCloseTo(1, 5);
        expect(result.intensities[1]).toBeCloseTo(32767 / 65535, 5);
    });

    it("copies classifications verbatim", () => {
        expect([...process(request()).classifications]).toEqual([2, 12]);
    });

    it("keeps 8-bit rgb as-is and folds 16-bit down by a byte", () => {
        const result = process(
            request({
                hasColor: true,
                rawR: Uint16Array.from([200, 65_280]),
                rawG: Uint16Array.from([100, 256]),
                rawB: Uint16Array.from([50, 51_000]),
            }),
        );

        expect([...result.colorsRgb.slice(0, 8)]).toEqual([
            200, 100, 50, 255, 255, 1, 199, 255,
        ]);
    });

    it("paints an opaque white fallback when no color channel exists", () => {
        const result = process(request());

        expect([...result.colorsRgb]).toEqual([
            255, 255, 255, 255, 255, 255, 255, 255,
        ]);
    });
});

describe("recolor", () => {
    it("grayscale-maps intensity across all three channels", () => {
        const colors = recolor(recolorRequest()).colors;

        expect([...colors.slice(0, 4)]).toEqual([255, 255, 255, 255]);
        expect(colors[4]).toBe(127);
        expect(colors[5]).toBe(127);
        expect(colors[7]).toBe(255);
    });

    it("runs elevation from blue at the floor to red at the ceiling", () => {
        const colors = recolor(
            recolorRequest({ scheme: "elevation" }),
        ).colors;

        expect([...colors.slice(0, 4)]).toEqual([0, 0, 255, 255]);
        expect([...colors.slice(4, 8)]).toEqual([255, 0, 0, 255]);
    });

    it("treats missing bounds as a unit elevation range", () => {
        const colors = recolor(
            recolorRequest({
                scheme: "elevation",
                heights: Float32Array.from([0, 2]),
                globalBounds: null,
            }),
        ).colors;

        // z=0 → floor; z=2 overshoots and clamps to the ceiling.
        expect(colors[0]).toBeLessThan(3);
        expect(colors[4]).toBeGreaterThan(252);
    });

    it("colors classifications from the palette, falling back to gray", () => {
        const colors = recolor(
            recolorRequest({ scheme: "classification" }),
        ).colors;

        // Class 2 (ground) is brown; class 12 is not in the palette → gray.
        expect([...colors.slice(0, 4)]).toEqual([165, 113, 78, 255]);
        expect([...colors.slice(4, 8)]).toEqual([128, 128, 128, 255]);
    });
});
