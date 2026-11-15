import { describe, expect, it } from "vitest";
import { Bbox, type BBox3D } from "@core/lib/geo";
import { cameraSnapshot } from "../__testFactories";
import {
    computeNodeScreenError,
    projectCameraToMeters,
    type NodeSseContext,
} from "./cameraProjection";

/** Camera straight above the box: distance is exactly its altitude. */
const CAMERA_POS: [number, number, number] = [10.5, 10.5, 1000];

const NODE_BOUNDS: BBox3D = Bbox.fromCorners({
    minX: 10,
    minY: 10,
    minZ: 0,
    maxX: 11,
    maxY: 11,
    maxZ: 0,
});

function sseContext(rootGeometricError: number): NodeSseContext {
    const camera = cameraSnapshot({ cameraPos: CAMERA_POS });
    return {
        ...projectCameraToMeters(camera.cameraPos),
        camera,
        geometricErrorByDepth: (depth: number) =>
            rootGeometricError / Math.pow(2, depth),
    };
}

describe("projectCameraToMeters", () => {
    it("places the camera at its own projection's origin in XY, passing Z through", () => {
        const { projector, cameraPosMeters } =
            projectCameraToMeters(CAMERA_POS);

        expect(cameraPosMeters[0]).toBeCloseTo(0, 6);
        expect(cameraPosMeters[1]).toBeCloseTo(0, 6);
        expect(cameraPosMeters[2]).toBe(1000);
        expect(projector.forward([CAMERA_POS[0], CAMERA_POS[1]])).toEqual([
            expect.closeTo(0, 6),
            expect.closeTo(0, 6),
        ]);
    });
});

describe("computeNodeScreenError", () => {
    it("applies the SSE formula over the projected cell", () => {
        // root geometric error 1 m at 1000 m on a 1080 px screen, 60° fov,
        // ratio 1: 1 * 1080 / (1000 * 2 * tan(30°)) ≈ 0.9353 px.
        expect(computeNodeScreenError(NODE_BOUNDS, 0, sseContext(1))).toBeCloseTo(
            1080 / (1000 * 2 * Math.tan(Math.PI / 6)),
            3,
        );
    });

    it("shrinks as the geometric error at depth shrinks", () => {
        const ctx = sseContext(10);

        const shallow = computeNodeScreenError(NODE_BOUNDS, 0, ctx);
        const deep = computeNodeScreenError(NODE_BOUNDS, 2, ctx);

        expect(deep).toBeCloseTo(shallow / 4, 6);
    });
});
