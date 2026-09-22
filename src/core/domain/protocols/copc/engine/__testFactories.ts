import { Bbox, type BBox3D, type FrustumPlanes } from "@core/lib/geo";
import type { CachedNode } from "../types";
import type { CameraSnapshot } from "./geometry";
import { parseOctreeKey } from "./octree/octreeKey";

/** Shared WGS84 extent for test nodes: a one-degree box around (10.5, 10.5). */
export const TEST_BOUNDS: BBox3D = Bbox.fromCorners({
    minX: 10,
    minY: 10,
    minZ: 0,
    maxX: 11,
    maxY: 11,
    maxZ: 0,
});

/** Minimal loaded CachedNode — override whatever the test actually asserts. */
export function cachedNode(
    key: string,
    overrides: Partial<CachedNode> = {},
): CachedNode {
    return {
        key,
        keyArray: parseOctreeKey(key),
        state: "loaded",
        pointCount: 1000,
        pointDataOffset: 0,
        pointDataLength: 1,
        bounds: TEST_BOUNDS,
        boundsWgs84: TEST_BOUNDS,
        ...overrides,
    };
}

/** Frustum planes that admit every AABB used in the engine tests. */
export function permissivePlanes(): FrustumPlanes {
    const plane = {
        normal: [0, 0, -1] as [number, number, number],
        distance: 1e9,
    };
    return {
        near: plane,
        far: plane,
        left: plane,
        right: plane,
        top: plane,
        bottom: plane,
    };
}

/** Camera 1000 m above TEST_BOUNDS, 60 degrees vertical fov on a 1080 px screen. */
export function cameraSnapshot(
    overrides: Partial<CameraSnapshot> = {},
): CameraSnapshot {
    return {
        cameraPos: [10.5, 10.5, 1000],
        cameraDirection: [0, 0, -1],
        fovRadians: Math.PI / 3,
        screenHeightPx: 1080,
        pixelRatio: 1,
        frustumPlanes: permissivePlanes(),
        projectToCommonSpace: (lng: number, lat: number) => [lng, lat, 0],
        ...overrides,
    };
}
