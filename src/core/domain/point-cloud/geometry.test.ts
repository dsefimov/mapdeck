import { describe, it, expect } from "vitest";
import {
    buildProjection,
    projectAabbToMeters,
    computeDistanceToCamera,
    computeScreenError,
} from "./geometry";
import type { BBox3D } from "./geometry";

describe("distance to camera", () => {
    const cameraLng = -122.4;
    const cameraLat = 37.8;

    it("camera at origin in aeqd", () => {
        const projector = buildProjection(cameraLng, cameraLat);
        const [cx, cy] = projector.forward([cameraLng, cameraLat]);
        expect(Math.abs(cx)).toBeLessThan(1e-6);
        expect(Math.abs(cy)).toBeLessThan(1e-6);
    });

    it("distance is altitude when node is at ground below camera", () => {
        // Camera at 500m altitude, pitch irrelevant for distance
        for (const alt of [100, 500, 2000]) {
            const projector = buildProjection(cameraLng, cameraLat);
            const [cx, cy] = projector.forward([cameraLng, cameraLat]);
            const nodeDeg: BBox3D = {
                minX: cameraLng - 0.001,
                minY: cameraLat - 0.001,
                minZ: 0,
                maxX: cameraLng + 0.001,
                maxY: cameraLat + 0.001,
                maxZ: 0,
            };
            const bboxM = projectAabbToMeters(nodeDeg, projector);
            const dist = computeDistanceToCamera([cx, cy, alt], bboxM);
            expect(dist).toBeCloseTo(alt, -1);
        }
    });

    it("distance to node at high altitude is smaller", () => {
        // Camera at 500m, node at 400-450m → closest Z = 450, dist = 50m
        const projector = buildProjection(cameraLng, cameraLat);
        const [cx, cy] = projector.forward([cameraLng, cameraLat]);
        const nodeDeg: BBox3D = {
            minX: cameraLng - 0.001,
            minY: cameraLat - 0.001,
            minZ: 400,
            maxX: cameraLng + 0.001,
            maxY: cameraLat + 0.001,
            maxZ: 450,
        };
        const bboxM = projectAabbToMeters(nodeDeg, projector);
        const dist = computeDistanceToCamera([cx, cy, 500], bboxM);
        expect(dist).toBeCloseTo(50, -1);
    });

    it("distance with horizontal offset (simulates tilt)", () => {
        // Camera at 500m altitude. When tilted (pitch>0), nodes visible
        // are offset horizontally from the camera's ground projection.
        // ~1000m east, at ground level.
        const projector = buildProjection(cameraLng, cameraLat);
        const [cx, cy] = projector.forward([cameraLng, cameraLat]);

        const nodeDeg: BBox3D = {
            minX: cameraLng + 0.009,
            minY: cameraLat - 0.0005,
            minZ: 0,
            maxX: cameraLng + 0.011,
            maxY: cameraLat + 0.0005,
            maxZ: 10,
        };
        const bboxM = projectAabbToMeters(nodeDeg, projector);

        const dist = computeDistanceToCamera([cx, cy, 500], bboxM);
        // Expected: sqrt(offsetX² + (500-10)²) ≈ sqrt(880² + 490²) ≈ 1007
        expect(dist).toBeGreaterThan(900);
        expect(dist).toBeLessThan(1050);
    });

    it("distance at different camera altitudes", () => {
        const projector = buildProjection(cameraLng, cameraLat);
        const [cx, cy] = projector.forward([cameraLng, cameraLat]);
        const nodeDeg: BBox3D = {
            minX: cameraLng - 0.001,
            minY: cameraLat - 0.001,
            minZ: 0,
            maxX: cameraLng + 0.001,
            maxY: cameraLat + 0.001,
            maxZ: 0,
        };
        const bboxM = projectAabbToMeters(nodeDeg, projector);

        // Distance should equal altitude for a node at ground level
        expect(computeDistanceToCamera([cx, cy, 100], bboxM)).toBeCloseTo(
            100,
            -1,
        );
        expect(computeDistanceToCamera([cx, cy, 500], bboxM)).toBeCloseTo(
            500,
            -1,
        );
        expect(computeDistanceToCamera([cx, cy, 2000], bboxM)).toBeCloseTo(
            2000,
            -1,
        );
    });

    it("SSE decreases with distance", () => {
        // Geometric error = 10m, screen = 1080px, FOV = 60°
        const geomErr = 10;
        const screenH = 1080;
        const fov = Math.PI / 3; // 60°

        // At 1000m: SSE ≈ 10*1080/(2*1000*tan(30°)) ≈ 9.4px
        // At 100m:  SSE ≈ 10*1080/(2*100*tan(30°)) ≈ 94px
        const sse1km = computeScreenError(geomErr, 1000, fov, screenH);
        const sse100m = computeScreenError(geomErr, 100, fov, screenH);

        expect(sse100m).toBeGreaterThan(sse1km);
        // Rough ratio: 1000/100 = 10x
        expect(sse100m / sse1km).toBeCloseTo(10, 0);
    });
});

describe("aeqd projection accuracy", () => {
    const projector = buildProjection(-122.4, 37.8);

    it("center maps to (0,0)", () => {
        const [x, y] = projector.forward([-122.4, 37.8]);
        expect(Math.abs(x)).toBeLessThan(1e-6);
        expect(Math.abs(y)).toBeLessThan(1e-6);
    });

    it("1 degree east ≈ 111km * cos(lat)", () => {
        const [x] = projector.forward([-121.4, 37.8]);
        const expected = 111320 * Math.cos((37.8 * Math.PI) / 180);
        expect(x).toBeCloseTo(expected, -3);
    });

    it("1 degree north ≈ 111km", () => {
        const [, y] = projector.forward([-122.4, 38.8]);
        expect(y).toBeCloseTo(111320, -3);
    });
});
