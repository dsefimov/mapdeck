import { describe, expect, it, vi } from "vitest";
import proj4 from "proj4";
import type {
    ProcessRawRequest,
    RawLasFields,
    RecolorRequest,
} from "./pointProcessing.types";
import { process, recolor } from "./pointProcessing.worker";
import { extractHeights } from "../../logic/colorize";

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

function rawFields(overrides: Partial<RawLasFields> = {}): RawLasFields {
    return {
        x: Float64Array.from([10, 20]),
        y: Float64Array.from([30, 40]),
        z: Float32Array.from([100, 200]),
        intensity: Uint16Array.from([65535, 32767]),
        classification: Uint8Array.from([2, 12]),
        r: null,
        g: null,
        b: null,
        ...overrides,
    };
}

function request(
    overrides: Partial<Omit<ProcessRawRequest, "raw">> & {
        raw?: RawLasFields;
    } = {},
): ProcessRawRequest {
    const { raw, ...rest } = overrides;
    return {
        kind: "process",
        requestId: "r1",
        pointCount: 2,
        hasColor: false,
        activeScheme: null,
        wkt: null,
        coordinateOrigin: [10, 30, 0],
        globalBounds: null,
        ...rest,
        raw: raw ?? rawFields(),
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
    it("echoes the request id", async () => {
        expect((await process(request({ requestId: "req-9" }))).requestId).toBe(
            "req-9",
        );
    });

    it("lays a geographic cloud out relative to the origin, heights untouched", async () => {
        const result = await process(request());

        expect([...result.positions]).toEqual([0, 0, 100, 10, 10, 200]);
    });

    it("reprojects a projected cloud through its WKT before shifting", async () => {
        const utm = { x: 500_000, y: 5_000_000 };
        const [lng, lat] = utm33nToWgs84.forward([
            utm.x,
            utm.y,
        ]) as [number, number];
        const result = await process(
            request({
                pointCount: 1,
                wkt: UTM33N_WKT,
                coordinateOrigin: [0, 0, 0],
                raw: rawFields({
                    x: Float64Array.from([utm.x]),
                    y: Float64Array.from([utm.y]),
                    z: Float32Array.from([7]),
                }),
            }),
        );

        expect(result.positions[0]).toBeCloseTo(lng, 5);
        expect(result.positions[1]).toBeCloseTo(lat, 5);
        expect(result.positions[2]).toBe(7);
    });

    it("scales intensities into the unit range", async () => {
        const result = await process(request());

        expect(result.intensities[0]).toBeCloseTo(1, 5);
        expect(result.intensities[1]).toBeCloseTo(32767 / 65535, 5);
    });

    it("copies classifications verbatim", async () => {
        expect([...(await process(request())).classifications]).toEqual([2, 12]);
    });

    it("keeps 8-bit rgb as-is and folds 16-bit down by a byte", async () => {
        const result = await process(
            request({
                hasColor: true,
                raw: rawFields({
                    r: Uint16Array.from([200, 65_280]),
                    g: Uint16Array.from([100, 256]),
                    b: Uint16Array.from([50, 51_000]),
                }),
            }),
        );

        expect([...result.colorsRgb.slice(0, 8)]).toEqual([
            200, 100, 50, 255, 255, 1, 199, 255,
        ]);
    });

    it("paints an opaque white fallback when no color channel exists", async () => {
        const result = await process(request());

        expect([...result.colorsRgb]).toEqual([
            255, 255, 255, 255, 255, 255, 255, 255,
        ]);
    });
});

describe("process — the active scheme rides the job", () => {
    const ELEVATION_BOUNDS: [number, number, number, number, number, number] =
        [0, 0, 100, 0, 0, 200];

    it("derives intensity colors byte-identically to the recolor path", async () => {
        const result = await process(request({ activeScheme: "intensity" }));

        const viaRecolor = recolor(
            recolorRequest({
                scheme: "intensity",
                intensities: result.intensities,
            }),
        );

        expect(result.colorsActive).toEqual(viaRecolor.colors);
    });

    it("derives elevation colors byte-identically to the recolor path", async () => {
        const result = await process(
            request({
                activeScheme: "elevation",
                globalBounds: ELEVATION_BOUNDS,
            }),
        );

        const viaRecolor = recolor(
            recolorRequest({
                scheme: "elevation",
                heights: extractHeights(result.positions),
                globalBounds: ELEVATION_BOUNDS,
            }),
        );

        expect(result.colorsActive).toEqual(viaRecolor.colors);
    });

    it("derives classification colors byte-identically to the recolor path", async () => {
        const result = await process(
            request({ activeScheme: "classification" }),
        );

        const viaRecolor = recolor(
            recolorRequest({
                scheme: "classification",
                classifications: result.classifications,
            }),
        );

        expect(result.colorsActive).toEqual(viaRecolor.colors);
    });

    it("produces no active buffer when none is requested", async () => {
        expect((await process(request())).colorsActive).toBeNull();
    });
});

describe("process — the compressed source rides the same job", () => {
    // decompressChunk is the only wasm-bound step; the rest of the decode
    // chain (View.create + extractors) runs for real against hand-built
    // PDRF-0 records. laz-perf itself is stubbed — its node build cannot
    // load the wasm binary in a test environment.
    const decompressMock = vi.hoisted(() => vi.fn());

    vi.mock("laz-perf", () => ({
        createLazPerf: vi.fn(async () => ({}) as never),
    }));

    vi.mock("copc", async (importOriginal) => {
        const actual = await importOriginal<typeof import("copc")>();
        return {
            ...actual,
            Las: {
                ...actual.Las,
                PointData: {
                    ...actual.Las.PointData,
                    decompressChunk: decompressMock,
                },
            },
        };
    });

    /**
     * Two PDRF-0 records whose scaled values reproduce the raw fixture:
     * X/Y/Z int32 × 0.001 → 10/20, 30/40, 100/200.
     */
    function buildPdrf0Records(): Uint8Array {
        const recordLength = 20;
        const out = new Uint8Array(2 * recordLength);
        const dv = new DataView(out.buffer);
        const points = [
            { x: 10_000, y: 30_000, z: 100_000, intensity: 65_535, cls: 2 },
            { x: 20_000, y: 40_000, z: 200_000, intensity: 32_767, cls: 12 },
        ];
        points.forEach((p, i) => {
            const o = i * recordLength;
            dv.setInt32(o, p.x, true);
            dv.setInt32(o + 4, p.y, true);
            dv.setInt32(o + 8, p.z, true);
            dv.setUint16(o + 12, p.intensity, true);
            dv.setUint8(o + 15, p.cls);
        });
        return out;
    }

    it("decodes, extracts and processes a compressed source like the raw one", async () => {
        decompressMock.mockResolvedValue(buildPdrf0Records());

        const viaSource = await process({
            kind: "process",
            requestId: "r1",
            pointCount: 2,
            hasColor: false,
            activeScheme: null,
            wkt: null,
            coordinateOrigin: [10, 30, 0],
            globalBounds: null,
            source: {
                compressed: new Uint8Array([1, 2, 3]),
                wasmUrl: "laz-perf.wasm",
                pointCount: 2,
                pointDataRecordFormat: 0,
                pointDataRecordLength: 20,
                scale: [0.001, 0.001, 0.001],
                offset: [0, 0, 0],
                extraBytes: [],
            },
        });
        // PDRF-0 maps classification 12 (Overlap) to 0, so the raw-path
        // expectation mirrors that quirk for the second point.
        const viaRaw = await process(
            request({
                raw: rawFields({
                    classification: Uint8Array.from([2, 0]),
                }),
            }),
        );

        expect(decompressMock).toHaveBeenCalledTimes(1);
        expect(viaSource.positions).toEqual(viaRaw.positions);
        expect(viaSource.intensities).toEqual(viaRaw.intensities);
        expect(viaSource.classifications).toEqual(viaRaw.classifications);
        expect(viaSource.colorsRgb).toEqual(viaRaw.colorsRgb);
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
