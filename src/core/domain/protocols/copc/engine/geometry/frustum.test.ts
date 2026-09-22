import { describe, expect, it } from "vitest";
import { WebMercatorViewport } from "@deck.gl/core";
import {
    Bbox,
    type BBox3D,
    type FrustumPlane,
    type FrustumPlanes,
} from "@core/lib/geo";
import {
    isAabbInFrustumPlanes,
    projectNodeBoundsToCommonSpace,
} from "./frustum";

const DIAG = Math.SQRT1_2;

/** Plane pushed so far out that no box in this suite can lie beyond it. */
const ADMIT_ALL: FrustumPlane = { normal: [0, 0, -1], distance: 1e9 };

/** Outward normal along +x with the plane at x = 10: outside is x > 10. */
const BEYOND_X10: FrustumPlane = { normal: [1, 0, 0], distance: 10 };

/** The same normal with a negative constant, which puts the plane at x = -10. */
const BEYOND_X_MINUS_10: FrustumPlane = { normal: [1, 0, 0], distance: -10 };

/**
 * A symmetric 90-degree frustum looking along +x with its apex at the origin.
 * The four side planes meet at the apex, so their intersection is the forward
 * cone alone — anything behind the camera fails at least one of them.
 */
const FORWARD_CONE: FrustumPlanes = {
    near: ADMIT_ALL,
    far: ADMIT_ALL,
    left: { normal: [-DIAG, DIAG, 0], distance: 0 },
    right: { normal: [-DIAG, -DIAG, 0], distance: 0 },
    top: { normal: [-DIAG, 0, DIAG], distance: 0 },
    bottom: { normal: [-DIAG, 0, -DIAG], distance: 0 },
};

function planes(overrides: Partial<FrustumPlanes> = {}): FrustumPlanes {
    return {
        near: ADMIT_ALL,
        far: ADMIT_ALL,
        left: ADMIT_ALL,
        right: ADMIT_ALL,
        top: ADMIT_ALL,
        bottom: ADMIT_ALL,
        ...overrides,
    };
}

function box(minX: number, maxX: number): BBox3D {
    return Bbox.fromCorners({ minX, minY: 0, minZ: 0, maxX, maxY: 1, maxZ: 1 });
}

function region(minX: number, maxX: number, minY: number, maxY: number): BBox3D {
    return Bbox.fromCorners({ minX, minY, minZ: -1, maxX, maxY, maxZ: 1 });
}

const LNG = 10.5;
const LAT = 10.5;

function viewportAt(
    zoom: number,
    pitch: number,
    bearing: number,
): WebMercatorViewport {
    return new WebMercatorViewport({
        width: 1200,
        height: 800,
        longitude: LNG,
        latitude: LAT,
        zoom,
        pitch,
        bearing,
    });
}

/** Mirror of the conversion DeckOverlayManager performs at the port boundary. */
function planesOf(vp: WebMercatorViewport): FrustumPlanes {
    const raw = vp.getFrustumPlanes();
    const convert = (p: (typeof raw)["near"]): FrustumPlane => {
        const [x = 0, y = 0, z = 0] = p.normal;
        return { distance: p.distance, normal: [x, y, z] };
    };
    return {
        near: convert(raw.near),
        far: convert(raw.far),
        left: convert(raw.left),
        right: convert(raw.right),
        top: convert(raw.top),
        bottom: convert(raw.bottom),
    };
}

/** One row of a column-major 4x4 applied to a point, with w implied as 1. */
function matrixRow(m: readonly number[], i: number, p: readonly number[]): number {
    return (
        (m[i] ?? 0) * (p[0] ?? 0) +
        (m[i + 4] ?? 0) * (p[1] ?? 0) +
        (m[i + 8] ?? 0) * (p[2] ?? 0) +
        (m[i + 12] ?? 0)
    );
}

/**
 * deck.gl's own verdict on a point, read straight off the matrix the frustum
 * planes are derived from. This is the authority the predicate must reproduce:
 * a plane test that disagrees with clip space culls what the GPU would draw.
 */
function isInsideClipSpace(
    vp: WebMercatorViewport,
    p: readonly number[],
): boolean {
    const m = vp.viewProjectionMatrix as unknown as readonly number[];
    const w = matrixRow(m, 3, p);
    return (
        w > 0 &&
        Math.abs(matrixRow(m, 0, p)) <= w &&
        Math.abs(matrixRow(m, 1, p)) <= w
    );
}

function commonSpacePoint(
    vp: WebMercatorViewport,
    dLng: number,
    dLat: number,
    alt: number,
): [number, number, number] {
    return vp.projectPosition([LNG + dLng, LAT + dLat, alt]) as [
        number,
        number,
        number,
    ];
}

/** A node collapsed to a single point, so the box test answers about that point. */
function pointBounds(p: readonly number[]): BBox3D {
    const [x = 0, y = 0, z = 0] = p;
    return Bbox.fromCorners({
        minX: x,
        minY: y,
        minZ: z,
        maxX: x,
        maxY: y,
        maxZ: z,
    });
}

interface Sample {
    zoom: number;
    pitch: number;
    bearing: number;
    offset: [number, number];
    alt: number;
}

/** Degrees east/north of the camera target — well inside to well outside. */
const OFFSETS: [number, number][] = [
    [0, 0],
    [0.002, 0],
    [-0.002, 0],
    [0, 0.002],
    [0, -0.002],
    [0.02, 0.02],
    [-0.02, -0.02],
    [0.2, 0],
    [0, -0.2],
];

const CAMERAS = [12, 14, 16].flatMap((zoom) =>
    [0, 45, 60].flatMap((pitch) =>
        [0, 37, 180, -75].map((bearing) => ({ zoom, pitch, bearing })),
    ),
);

const PROBES = OFFSETS.flatMap((offset) =>
    [0, 50, 2000].map((alt) => ({ offset, alt })),
);

const SAMPLES: Sample[] = CAMERAS.flatMap((camera) =>
    PROBES.map((probe) => ({ ...camera, ...probe })),
);

function describeSample(s: Sample): string {
    return `zoom ${s.zoom} pitch ${s.pitch} bearing ${s.bearing} offset ${s.offset.join()} alt ${s.alt}`;
}

describe("isAabbInFrustumPlanes against deck.gl's own clip space", () => {
    it("agrees with the view-projection matrix at every sampled camera and point", () => {
        const disagreements = SAMPLES.filter((s) => {
            const vp = viewportAt(s.zoom, s.pitch, s.bearing);
            const p = commonSpacePoint(vp, s.offset[0], s.offset[1], s.alt);
            return (
                isAabbInFrustumPlanes(pointBounds(p), planesOf(vp)) !==
                isInsideClipSpace(vp, p)
            );
        });

        expect(disagreements.map(describeSample)).toEqual([]);
    });

    it("covers both verdicts, so agreement is not agreement on a constant", () => {
        const verdicts = SAMPLES.map((s) => {
            const vp = viewportAt(s.zoom, s.pitch, s.bearing);
            return isInsideClipSpace(
                vp,
                commonSpacePoint(vp, s.offset[0], s.offset[1], s.alt),
            );
        });

        expect(verdicts).toContain(true);
        expect(verdicts).toContain(false);
    });
});

describe("isAabbInFrustumPlanes against a real deck.gl viewport", () => {
    const FAR_OFF_SCREEN = 0.2;

    it.each<[number, number]>([
        [0, 0],
        [45, 20],
        [60, 200],
        [30, -75],
    ])(
        "keeps the node under the camera at pitch %i, bearing %i",
        (pitch, bearing) => {
            const vp = viewportAt(14, pitch, bearing);
            const bounds = projectNodeBoundsToCommonSpace(
                nodeAround(0, 0),
                projectorOf(vp),
            );

            expect(isAabbInFrustumPlanes(bounds, planesOf(vp))).toBe(true);
        },
    );

    it.each<[number, number]>([
        [FAR_OFF_SCREEN, 0],
        [-FAR_OFF_SCREEN, 0],
        [0, FAR_OFF_SCREEN],
        [0, -FAR_OFF_SCREEN],
    ])(
        "drops a node %f, %f degrees away, several screens outside the view",
        (dLng, dLat) => {
            const vp = viewportAt(14, 45, 0);
            const bounds = projectNodeBoundsToCommonSpace(
                nodeAround(dLng, dLat),
                projectorOf(vp),
            );

            expect(isAabbInFrustumPlanes(bounds, planesOf(vp))).toBe(false);
        },
    );

    it("reads plane constants of both signs, so their sign cannot be stripped", () => {
        const planeSet = planesOf(viewportAt(14, 45, 20));
        const constants = (["left", "right", "top", "bottom"] as const).map(
            (side) => planeSet[side].distance,
        );

        expect(constants.some((d) => d < 0)).toBe(true);
        expect(constants.some((d) => d > 0)).toBe(true);
    });
});

function projectorOf(
    vp: WebMercatorViewport,
): (lng: number, lat: number, alt: number) => [number, number, number] {
    return (lng, lat, alt) =>
        vp.projectPosition([lng, lat, alt]) as [number, number, number];
}

/** A small WGS84 node centred at the given offset from the camera target. */
function nodeAround(dLng: number, dLat: number): BBox3D {
    return Bbox.fromCorners({
        minX: LNG + dLng - 0.0005,
        minY: LAT + dLat - 0.0005,
        minZ: 0,
        maxX: LNG + dLng + 0.0005,
        maxY: LAT + dLat + 0.0005,
        maxZ: 10,
    });
}

describe("projectNodeBoundsToCommonSpace", () => {
    it("returns absolute common space, the space the frustum planes live in", () => {
        const vp = viewportAt(14, 45, 0);
        const bounds = projectNodeBoundsToCommonSpace(
            nodeAround(0, 0),
            projectorOf(vp),
        );
        const corner = vp.projectPosition([LNG - 0.0005, LAT - 0.0005, 0]);

        expect(bounds.minX).toBeCloseTo(corner[0] ?? 0, 10);
        expect(bounds.minY).toBeCloseTo(corner[1] ?? 0, 10);
    });

    it("spans the extremes of every projected corner", () => {
        const bounds = projectNodeBoundsToCommonSpace(
            Bbox.fromCorners({
                minX: 1,
                minY: 2,
                minZ: 3,
                maxX: 4,
                maxY: 5,
                maxZ: 6,
            }),
            (lng, lat, alt) => [-lng, -lat, -alt],
        );

        expect(bounds.bounds3D).toEqual([-4, -5, -6, -1, -2, -3]);
    });
});

describe("isAabbInFrustumPlanes against a real view cone", () => {
    it.each<[string, BBox3D, boolean]>([
        ["ahead of the camera", region(9, 11, -1, 1), true],
        ["behind the camera", region(-11, -9, -1, 1), false],
        ["off to one side", region(9, 11, 20, 22), false],
        ["straddling the apex", region(-1, 1, -1, 1), true],
    ])("sees a box %s", (_case, bounds, expected) => {
        expect(isAabbInFrustumPlanes(bounds, FORWARD_CONE)).toBe(expected);
    });
});

describe("isAabbInFrustumPlanes plane by plane", () => {
    it("accepts a box that no plane rejects", () => {
        expect(isAabbInFrustumPlanes(box(0, 10), planes())).toBe(true);
    });

    it("culls a box lying entirely beyond a side plane", () => {
        expect(
            isAabbInFrustumPlanes(box(20, 30), planes({ left: BEYOND_X10 })),
        ).toBe(false);
    });

    it("keeps a box that straddles the plane, testing the least-outward corner", () => {
        expect(
            isAabbInFrustumPlanes(box(5, 100), planes({ left: BEYOND_X10 })),
        ).toBe(true);
    });

    it.each<[BBox3D, boolean]>([
        [box(-30, -20), true],
        [box(0, 5), false],
    ])(
        "takes a negative plane constant as a position, not as a magnitude",
        (bounds, expected) => {
            expect(
                isAabbInFrustumPlanes(
                    bounds,
                    planes({ left: BEYOND_X_MINUS_10 }),
                ),
            ).toBe(expected);
        },
    );

    it.each<[number, boolean]>([
        [9.9, true],
        [10.1, false],
    ])(
        "decides a box from x=%f on the plane position alone, with no slack",
        (minX, expected) => {
            expect(
                isAabbInFrustumPlanes(
                    box(minX, minX + 1),
                    planes({ left: BEYOND_X10 }),
                ),
            ).toBe(expected);
        },
    );

    it("ignores the near and far planes, so depth alone never culls a node", () => {
        expect(
            isAabbInFrustumPlanes(
                box(100, 200),
                planes({ near: BEYOND_X10, far: BEYOND_X10 }),
            ),
        ).toBe(true);
    });
});
