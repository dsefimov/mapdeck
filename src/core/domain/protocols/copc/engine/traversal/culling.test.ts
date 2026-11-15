import { describe, expect, it } from "vitest";
import type { Converter } from "proj4";
import { cachedNode, cameraSnapshot, permissivePlanes } from "../__testFactories";
import { buildProjection } from "../geometry";
import { shouldCullNode, type CullingContext } from "./culling";

const KEY = "1-0-0-0";

/** Centre of TEST_BOUNDS, so the projection is local to the node under test. */
const CENTRE_LNG = 10.5;
const CENTRE_LAT = 10.5;

/**
 * A plane standing between the camera and TEST_BOUNDS: its outward normal runs
 * east and it sits at x = 1, well short of the node, which starts at x = 10.
 */
const BEHIND_THE_NODE = {
    normal: [1, 0, 0] as [number, number, number],
    distance: 1,
};

/** High enough above the cloud for the anti-overzoom guard to engage. */
const HIGH_ALTITUDE: [number, number, number] = [0, 0, 100_000];

/** Inside the two-kilometre radius where the guard stands down. */
const LOW_ALTITUDE: [number, number, number] = [0, 0, 1_000];

/**
 * proj4 is the most expensive step, so culling must reject a node before
 * reaching it. This projector turns that ordering rule into a failure.
 */
function explodingProjector(): Converter {
    const real = buildProjection(CENTRE_LNG, CENTRE_LAT);
    return Object.assign(Object.create(real) as Converter, {
        forward: (): never => {
            throw new Error("proj4 ran for an already rejected node");
        },
    });
}

function cullingContext(
    overrides: Partial<CullingContext> = {},
): CullingContext {
    return {
        rbushKeySet: new Set([KEY]),
        camera: cameraSnapshot(),
        cameraPosMeters: LOW_ALTITUDE,
        projector: buildProjection(CENTRE_LNG, CENTRE_LAT),
        geometricErrorByDepth: () => 10,
        maxOctreeDepth: 20,
        maxScreenErrorPx: 2,
        ...overrides,
    };
}

function cull(depth: number, overrides: Partial<CullingContext> = {}): boolean {
    return shouldCullNode(KEY, cachedNode(KEY), depth, cullingContext(overrides));
}

describe("shouldCullNode", () => {
    it("keeps a node the viewport covers at a depth the distance allows", () => {
        expect(cull(1)).toBe(false);
    });

    it("drops a node the spatial prefilter never returned", () => {
        expect(cull(1, { rbushKeySet: new Set() })).toBe(true);
    });

    it("drops a node whose bounds fall outside the frustum", () => {
        const camera = cameraSnapshot({
            frustumPlanes: {
                ...permissivePlanes(),
                left: BEHIND_THE_NODE,
            },
        });

        expect(cull(1, { camera })).toBe(true);
    });

    it("drops a node deeper than the distance can justify", () => {
        expect(cull(5, { cameraPosMeters: HIGH_ALTITUDE })).toBe(true);
    });

    it("keeps that same depth once the camera comes close enough", () => {
        expect(cull(5, { cameraPosMeters: LOW_ALTITUDE })).toBe(false);
    });

    it("rejects a prefiltered-out node before projecting a single corner", () => {
        const camera = cameraSnapshot({
            projectToCommonSpace: (): never => {
                throw new Error("the frustum test ran for a rejected node");
            },
        });

        expect(cull(1, { rbushKeySet: new Set(), camera })).toBe(true);
    });

    it("rejects a node outside the frustum before paying for a projection", () => {
        const camera = cameraSnapshot({
            frustumPlanes: {
                ...permissivePlanes(),
                left: BEHIND_THE_NODE,
            },
        });

        expect(cull(1, { camera, projector: explodingProjector() })).toBe(true);
    });
});
