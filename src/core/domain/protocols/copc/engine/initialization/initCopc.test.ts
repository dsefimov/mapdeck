import { afterEach, describe, expect, it, vi } from "vitest";
import type { Copc as CopcType } from "copc";
import proj4 from "proj4";
import { Bbox, type BBox3D } from "@core/lib/geo";
import { metersPerDegreeAt } from "../geometry";
import {
    buildCrsTransformer,
    computeCoordinateOrigin,
    computeSpacingMeters,
    computeWgs84Bounds,
    extractCopcMeta,
    initCopc,
    openCopcSource,
} from "./initCopc";

/**
 * A controllable stand-in for copc.js: every suite decides what Copc.create
 * hands back (or throws) through this shared cell.
 */
const copcMock = vi.hoisted(() => ({
    stub: null as unknown,
    error: null as unknown,
    createdFrom: [] as unknown[],
}));

vi.mock("copc", () => ({
    Copc: {
        create: vi.fn(async (source: unknown) => {
            copcMock.createdFrom.push(source);
            if (copcMock.error) throw copcMock.error;
            return copcMock.stub;
        }),
    },
}));

type Triple = [number, number, number];
type Corner = [number, number];

const EQUATOR_DEGREE_M = 111_320;

/**
 * Only the extent a bounds computation reads. A LAS header carries dozens of
 * further fields, none of which reach this code.
 */
function header(min: Triple, max: Triple): CopcType["header"] {
    return { min, max } as CopcType["header"];
}

function boundsOf(
    minY: number,
    maxY: number,
    minX = 0,
    maxX = 1,
): BBox3D {
    return Bbox.fromCorners({ minX, minY, minZ: 0, maxX, maxY, maxZ: 100 });
}

/**
 * A real projected CRS, because the whole point of these cases is that a
 * genuine projection bends the extent in ways no hand-written stub would.
 */
const utmToWgs84 = proj4(
    "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs",
    "EPSG:4326",
);

const fromUtm = (c: Corner): Corner => utmToWgs84.forward(c) as Corner;
const atUtm = (easting: number, northing: number): Corner =>
    fromUtm([easting, northing]);

describe("computeWgs84Bounds", () => {
    it("takes a cloud that is already geographic straight from its header", () => {
        const result = computeWgs84Bounds(header([10, 50, 100], [11, 51, 200]), null);

        expect(result).toMatchObject({
            minX: 10,
            minY: 50,
            minZ: 100,
            maxX: 11,
            maxY: 51,
            maxZ: 200,
        });
    });

    it("puts a projected cloud's corners through the transformer", () => {
        const shift = ([x, y]: Corner): Corner => [x / 1000, y / 1000];

        const result = computeWgs84Bounds(
            header([10_000, 50_000, 0], [11_000, 51_000, 5]),
            shift,
        );

        expect(result).toMatchObject({ minX: 10, minY: 50, maxX: 11, maxY: 51 });
    });

    it("leaves elevation alone, since the transformer only speaks in two dimensions", () => {
        const result = computeWgs84Bounds(
            header([0, 0, 100], [1, 1, 200]),
            ([x, y]: Corner): Corner => [x + 5, y + 5],
        );

        expect([result.minZ, result.maxZ]).toEqual([100, 200]);
    });

    it("sorts the corners back into order when the transformer flips an axis", () => {
        const mirror = ([x, y]: Corner): Corner => [-x, -y];

        const result = computeWgs84Bounds(header([10, 50, 0], [11, 51, 0]), mirror);

        expect(result).toMatchObject({
            minX: -11,
            minY: -51,
            maxX: -10,
            maxY: -50,
        });
    });

    it("reaches the two corners the header never names", () => {
        const rotate45 = ([x, y]: Corner): Corner => [
            (x - y) * Math.SQRT1_2,
            (x + y) * Math.SQRT1_2,
        ];

        const result = computeWgs84Bounds(header([0, 0, 0], [1, 1, 0]), rotate45);

        expect(result.minX).toBeCloseTo(-Math.SQRT1_2, 6);
        expect(result.maxX).toBeCloseTo(Math.SQRT1_2, 6);
    });

    it("covers a real UTM extent whose west edge leans past its south-west corner", () => {
        const result = computeWgs84Bounds(
            header([300_000, 5_000_000, 0], [700_000, 5_400_000, 0]),
            fromUtm,
        );

        expect(result.minX).toBeLessThanOrEqual(atUtm(300_000, 5_400_000)[0]);
        expect(result.minX).toBeLessThan(atUtm(300_000, 5_000_000)[0]);
    });

    it("follows an edge to its crest, which lies between the corners, not on them", () => {
        const northing = 5_400_000;
        const crest = atUtm(500_000, northing)[1];
        const corners = [
            atUtm(494_000, northing)[1],
            atUtm(516_000, northing)[1],
        ];

        const result = computeWgs84Bounds(
            header([494_000, 5_390_000, 0], [516_000, northing, 0]),
            fromUtm,
        );

        expect(result.maxY).toBeGreaterThan(Math.max(...corners));
        expect((crest - result.maxY) * EQUATOR_DEGREE_M).toBeLessThan(0.1);
    });

    it("pulls a corner that lands off the globe back onto it", () => {
        const result = computeWgs84Bounds(
            header([-400, -100, 0], [400, 100, 0]),
            null,
        );

        expect(result).toMatchObject({
            minX: -180,
            minY: -90,
            maxX: 180,
            maxY: 90,
        });
    });
});

describe("computeCoordinateOrigin", () => {
    it("sits at the middle of the horizontal extent", () => {
        const origin = computeCoordinateOrigin(boundsOf(0, 50, 0, 100));

        expect([origin[0], origin[1]]).toEqual([50, 25]);
    });

    it("anchors elevation at zero rather than at mid-height, so a point's height stays its own", () => {
        expect(computeCoordinateOrigin(boundsOf(0, 50))[2]).toBe(0);
    });
});

describe("computeSpacingMeters", () => {
    it("converts a geographic cloud's spacing from degrees to metres", () => {
        const result = computeSpacingMeters(0.01, boundsOf(-1, 1), false);

        expect(result).toBeCloseTo(0.01 * EQUATOR_DEGREE_M, 3);
    });

    it("narrows the conversion towards the poles, where a degree of longitude is shorter", () => {
        const result = computeSpacingMeters(0.01, boundsOf(59, 61), false);

        expect(result).toBeCloseTo(0.01 * EQUATOR_DEGREE_M * Math.cos(Math.PI / 3), 3);
    });

    it("leaves a projected cloud's spacing be, since it already counts in metres", () => {
        expect(computeSpacingMeters(2.5, boundsOf(59, 61), true)).toBe(2.5);
    });

    it.each([0, -1])(
        "leaves a spacing of %s alone, having nothing to scale",
        (spacing) => {
            expect(computeSpacingMeters(spacing, boundsOf(59, 61), false)).toBe(
                spacing,
            );
        },
    );
});

/**
 * A real projected CRS in the exact form a COPC file carries it in `wkt`.
 */
const UTM33N_WKT =
    'PROJCS["WGS 84 / UTM zone 33N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",15],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1,AUTHORITY["EPSG","9001"]],AUTHORITY["EPSG","32633"]]';

/** Same CRS as a proj string — the independent expectation source. */
const utm33nToWgs84 = proj4(
    "+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs",
    "EPSG:4326",
);

const SOURCE_URL = "https://example.com/cloud.copc.laz";

/**
 * A minimal but correctly-shaped Copc instance: everything initCopc reads,
 * nothing else.
 */
function copcStub(overrides: Record<string, unknown> = {}): CopcType {
    return {
        header: {
            pointCount: 1000,
            pointDataRecordFormat: 1,
            min: [10, 50, 100],
            max: [11, 51, 200],
        },
        info: {
            spacing: 0.5,
            cube: [10, 50, 100, 11, 51, 200],
            rootHierarchyPage: { pageOffset: 4096, pageLength: 256 },
        },
        wkt: null,
        ...overrides,
    } as unknown as CopcType;
}

function givenCopc(stub: CopcType): void {
    copcMock.stub = stub;
}

describe("openCopcSource", () => {
    afterEach(() => {
        copcMock.error = null;
        copcMock.createdFrom = [];
    });

    it("opens a URL source and resolves it onward unchanged", async () => {
        givenCopc(copcStub());

        const { copc, resolvedSource } = await openCopcSource(
            SOURCE_URL,
        );

        expect(copc).toBe(copcMock.stub);
        expect(resolvedSource).toBe(SOURCE_URL);
        expect(copcMock.createdFrom[0]).toBe(resolvedSource);
    });

    it("rejects an empty URL outright", async () => {
        await expect(openCopcSource("   ")).rejects.toThrow(
            /Source URL is empty/,
        );
    });

    it("turns a failed fetch into a CORS hint", async () => {
        givenCopc(copcStub());
        copcMock.error = new TypeError("Failed to fetch");

        await expect(
            openCopcSource(SOURCE_URL),
        ).rejects.toThrow(/CORS/);
    });

    it("flags a payload that is not a COPC file", async () => {
        givenCopc(copcStub());
        copcMock.error = new Error("access denied");

        await expect(
            openCopcSource(SOURCE_URL),
        ).rejects.toThrow(/Invalid COPC/);
    });

    it("wraps any other failure with its cause", async () => {
        givenCopc(copcStub());
        copcMock.error = new Error("connection reset");

        await expect(
            openCopcSource(SOURCE_URL),
        ).rejects.toThrow(/Failed to create Copc instance.*connection reset/s);
    });

    it("serves a File through a buffer getter", async () => {
        givenCopc(copcStub());

        const file = new File([new ArrayBuffer(8)], "cloud.copc.laz");
        const { resolvedSource } = await openCopcSource(file);

        expect(typeof resolvedSource).toBe("function");
        expect(copcMock.createdFrom[0]).toBe(resolvedSource);
    });

    it("serves an ArrayBuffer through the same getter path", async () => {
        givenCopc(copcStub());

        const { resolvedSource } = await openCopcSource(new ArrayBuffer(8));

        expect(typeof resolvedSource).toBe("function");
        expect(copcMock.createdFrom[0]).toBe(resolvedSource);
    });

    it("refuses an unsupported source kind", async () => {
        await expect(openCopcSource(123 as never)).rejects.toThrow(
            /Unsupported source type/,
        );
    });
});

describe("extractCopcMeta", () => {
    it("flattens header and info into the meta shape", () => {
        const meta = extractCopcMeta(copcStub());

        expect(meta).toMatchObject({
            totalPoints: 1000,
            spacing: 0.5,
            octreeCube: [10, 50, 100, 11, 51, 200],
            rootHierarchyPage: { pageOffset: 4096, pageLength: 256 },
            hasColor: false,
        });
    });

    it.each<[number, boolean]>([
        [2, true],
        [3, true],
        [5, true],
        [7, true],
        [8, true],
        [10, true],
        [1, false],
        [6, false],
    ])(
        "reads point format %i as %s color-capable",
        (format, hasColor) => {
            const stub = copcStub({
                header: { pointCount: 1, pointDataRecordFormat: format },
            });

            expect(extractCopcMeta(stub).hasColor).toBe(hasColor);
        },
    );
});

describe("buildCrsTransformer", () => {
    it("turns a real WKT into a working transform", () => {
        const transform = buildCrsTransformer(UTM33N_WKT);
        const expected = utm33nToWgs84.forward([500_000, 5_000_000]);

        const [lng, lat] = transform([500_000, 5_000_000]);
        expect(lng).toBeCloseTo(expected[0]!, 6);
        expect(lat).toBeCloseTo(expected[1]!, 6);
    });

    it("sees through a COMPD_CS wrapper by extracting the PROJCS part", () => {
        const wrapped = `COMPD_CS["compound", ${UTM33N_WKT}, VERT_CS["height",UNIT["metre",1]]]`;

        const transform = buildCrsTransformer(wrapped);
        const expected = utm33nToWgs84.forward([500_000, 5_000_000]);

        const [lng, lat] = transform([500_000, 5_000_000]);
        expect(lng).toBeCloseTo(expected[0]!, 6);
        expect(lat).toBeCloseTo(expected[1]!, 6);
    });

    it("refuses a WKT proj4 cannot parse", () => {
        expect(() => buildCrsTransformer("NOT_A_CRS")).toThrow();
    });
});

describe("initCopc pipeline", () => {
    afterEach(() => {
        copcMock.error = null;
        copcMock.createdFrom = [];
    });

    it("walks a geographic cloud straight from its header", async () => {
        givenCopc(copcStub());

        const { meta, transformer, needsTransform } = await initCopc(
            SOURCE_URL,
        );

        expect(needsTransform).toBe(false);
        expect(transformer).toBeNull();
        expect(meta.wkt).toBeNull();
        expect(meta.bounds).toMatchObject({
            minX: 10,
            minY: 50,
            minZ: 100,
            maxX: 11,
            maxY: 51,
            maxZ: 200,
        });
        expect(meta.coordinateOrigin).toEqual([10.5, 50.5, 0]);
        expect(meta.spacingMeters).toBeCloseTo(
            0.5 * metersPerDegreeAt(50.5),
            6,
        );
    });

    it("drives a projected cloud through its WKT transform", async () => {
        givenCopc(
            copcStub({
                wkt: UTM33N_WKT,
                header: {
                    pointCount: 1000,
                    pointDataRecordFormat: 1,
                    min: [480_000, 4_980_000, 0],
                    max: [520_000, 5_020_000, 300],
                },
                info: {
                    spacing: 2,
                    cube: [480_000, 4_980_000, 0, 520_000, 5_020_000, 300],
                    rootHierarchyPage: { pageOffset: 4096, pageLength: 256 },
                },
            }),
        );

        const { meta, transformer, needsTransform } = await initCopc(
            SOURCE_URL,
        );

        expect(needsTransform).toBe(true);
        expect(transformer).toBeTypeOf("function");
        expect(meta.wkt).toBe(UTM33N_WKT);
        expect(meta.bounds.minY).toBeGreaterThan(-90);
        expect(meta.bounds.maxY).toBeLessThan(90);
        // A projected spacing already counts in metres — left alone.
        expect(meta.spacingMeters).toBe(2);
    });

    it("surfaces a broken WKT as an actionable failure", async () => {
        givenCopc(copcStub({ wkt: "NOT_A_CRS" }));

        await expect(
            initCopc(SOURCE_URL),
        ).rejects.toThrow(/Failed to setup coordinate transformation/);
    });
});
