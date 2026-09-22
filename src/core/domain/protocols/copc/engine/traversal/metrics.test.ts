import { describe, expect, it } from "vitest";
import { Bbox, type BBox3D } from "@core/lib/geo";
import { cachedNode, cameraSnapshot } from "../__testFactories";
import { buildProjection } from "../geometry";
import type { PriorityBounds } from "../priority";
import {
    computeFoveatedFactor,
    computeNodeMetrics,
    type MetricsContext,
} from "./metrics";

const EPSILON7 = 1e-7;

/** Camera at the origin of its own projection, looking along +x. */
const AT_ORIGIN: [number, number, number] = [0, 0, 0];
const LOOKING_EAST: [number, number, number] = [1, 0, 0];

const NEAR_KEY = "1-0-0-0";
const FAR_KEY = "1-1-1-1";

/** A degree away from the camera, so it projects far outside the near node. */
const FAR_BOUNDS: BBox3D = Bbox.fromCorners({
    minX: 20,
    minY: 20,
    minZ: 0,
    maxX: 21,
    maxY: 21,
    maxZ: 0,
});

function atAngle(degrees: number): [number, number, number] {
    const radians = (degrees * Math.PI) / 180;
    return [Math.cos(radians) * 100, Math.sin(radians) * 100, 0];
}

function emptyBounds(): PriorityBounds {
    return {
        minDepth: Infinity,
        maxDepth: -Infinity,
        minFoveatedFactor: Infinity,
        maxFoveatedFactor: -Infinity,
        minReverseSSE: Infinity,
        maxReverseSSE: -Infinity,
    };
}

function metricsContext(bounds: PriorityBounds): MetricsContext {
    const camera = cameraSnapshot();
    return {
        projector: buildProjection(camera.cameraPos[0], camera.cameraPos[1]),
        cameraPosMeters: [0, 0, camera.cameraPos[2]],
        camera,
        geometricErrorByDepth: (depth: number) => 10 / Math.pow(2, depth),
        bounds,
        priorityStateMap: new WeakMap(),
    };
}

describe("computeFoveatedFactor", () => {
    it.each<[number, number]>([
        [0, 0],
        [60, 0.5],
        [90, 1 - EPSILON7],
        [120, 1 - EPSILON7],
        [180, 1 - EPSILON7],
    ])(
        "rates a tile %i degrees off the view axis at %f",
        (degrees, expected) => {
            expect(
                computeFoveatedFactor(
                    atAngle(degrees),
                    AT_ORIGIN,
                    LOOKING_EAST,
                ),
            ).toBeCloseTo(expected, 6);
        },
    );

    it("never exceeds one, however far behind the camera the tile sits", () => {
        const behind = computeFoveatedFactor(
            atAngle(180),
            AT_ORIGIN,
            LOOKING_EAST,
        );

        expect(behind).toBeLessThan(1);
    });

    it("rates a tile centred on the camera as fully central", () => {
        expect(
            computeFoveatedFactor(AT_ORIGIN, AT_ORIGIN, LOOKING_EAST),
        ).toBe(0);
    });
});

describe("computeNodeMetrics", () => {
    it("widens the criterion bounds across the nodes it visits", () => {
        const bounds = emptyBounds();
        const ctx = metricsContext(bounds);

        computeNodeMetrics(cachedNode(NEAR_KEY), 1, ctx);
        computeNodeMetrics(cachedNode(FAR_KEY, { boundsWgs84: FAR_BOUNDS }), 3, ctx);

        expect(bounds.minDepth).toBe(1);
        expect(bounds.maxDepth).toBe(3);
        expect(bounds.minFoveatedFactor).toBeLessThan(
            bounds.maxFoveatedFactor,
        );
    });

    it("measures a farther node as farther, and so as sharper on screen", () => {
        const ctx = metricsContext(emptyBounds());

        const near = computeNodeMetrics(cachedNode(NEAR_KEY), 1, ctx);
        const far = computeNodeMetrics(
            cachedNode(FAR_KEY, { boundsWgs84: FAR_BOUNDS }),
            1,
            ctx,
        );

        expect(far.distanceToCamera).toBeGreaterThan(near.distanceToCamera);
        expect(far.screenError).toBeLessThan(near.screenError);
    });

    it("refines a deeper node less, since its geometric error is smaller", () => {
        const ctx = metricsContext(emptyBounds());
        const node = cachedNode(NEAR_KEY);

        const shallow = computeNodeMetrics(node, 1, ctx);
        const deep = computeNodeMetrics(node, 4, ctx);

        expect(deep.screenError).toBeLessThan(shallow.screenError);
    });

    it("stores the node's own metrics in the priority state it seeds", () => {
        const ctx = metricsContext(emptyBounds());
        const node = cachedNode(NEAR_KEY);

        const metrics = computeNodeMetrics(node, 2, ctx);
        const state = ctx.priorityStateMap.get(node);

        expect(state?.depth).toBe(2);
        expect(state?.distanceToCamera).toBe(metrics.distanceToCamera);
        expect(state?.priority).toBe(metrics.priority);
    });
});
