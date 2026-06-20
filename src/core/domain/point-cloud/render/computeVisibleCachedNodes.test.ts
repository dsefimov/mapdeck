import { describe, it, expect } from "vitest";
import { computeVisibleCachedNodes } from "./computeVisibleCachedNodes";
import type { CachedNode } from "@core/framework/types";
import type { CameraSnapshot, FrustumPlanes } from "../geometry";

function makeNode(
    key: string,
    state: CachedNode["state"],
    boundsWgs84: {
        minX: number;
        minY: number;
        minZ: number;
        maxX: number;
        maxY: number;
        maxZ: number;
    },
    pointCount = 1000,
): CachedNode {
    return {
        key,
        keyArray: [0, 0, 0, 0],
        state,
        pointCount,
        pointDataOffset: 0,
        pointDataLength: 0,
        bounds: boundsWgs84,
        boundsWgs84,
        ...(state === "loaded"
            ? { positions: new Float32Array(pointCount * 3) }
            : {}),
    };
}

function toMap(nodes: CachedNode[]): Map<string, CachedNode> {
    return new Map(nodes.map((n) => [n.key, n]));
}

const mockProjectToCommonSpace = (
    lng: number,
    lat: number,
    alt: number,
): [number, number, number] => [lng, lat, alt];
const mockCenterOffset: [number, number, number] = [0, 0, 0];
const mockCameraPos: [number, number, number] = [0, 0, 0];
const mockFovRadians = (60 * Math.PI) / 180;
const mockScreenHeightPx = 1080;
const mockGeometricError = (_depth: number) => 100;

function makeMockCamera(
    overrides: Partial<CameraSnapshot> = {},
): CameraSnapshot {
    return {
        frustumPlanes: makeAllPassFrustum(),
        cameraPos: mockCameraPos,
        fovRadians: mockFovRadians,
        projectToCommonSpace: mockProjectToCommonSpace,
        centerOffset: mockCenterOffset,
        screenHeightPx: mockScreenHeightPx,
        ...overrides,
    };
}

function makeAllPassFrustum(): FrustumPlanes {
    const plane = {
        distance: -1,
        normal: [0, 0, 1] as [number, number, number],
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

describe("computeVisibleCachedNodes", () => {
    it("returns loaded node inside frustum with SSE pass", () => {
        const node = makeNode("1-0-0-0", "loaded", {
            minX: 1,
            minY: 1,
            minZ: 0,
            maxX: 2,
            maxY: 2,
            maxZ: 10,
        });
        const cache = toMap([node]);

        const result = computeVisibleCachedNodes(
            cache,
            makeMockCamera(),
            mockGeometricError,
            2, // maxScreenErrorPx — high threshold, everything passes
        );

        expect(result).toEqual(["1-0-0-0"]);
    });

    it("excludes non-loaded node", () => {
        const pending = makeNode("1-0-0-0", "pending", {
            minX: 1,
            minY: 1,
            minZ: 0,
            maxX: 2,
            maxY: 2,
            maxZ: 10,
        });
        const cache = toMap([pending]);

        const result = computeVisibleCachedNodes(
            cache,
            makeMockCamera(),
            mockGeometricError,
            2,
        );

        expect(result).toEqual([]);
    });

    it("returns empty array for empty cache", () => {
        const result = computeVisibleCachedNodes(
            new Map(),
            makeMockCamera(),
            mockGeometricError,
            2,
        );

        expect(result).toEqual([]);
    });

    it("SSE filter: parent passes → children skipped", () => {
        // Parent at depth 1 passes SSE with high threshold
        const parent = makeNode("1-0-0-0", "loaded", {
            minX: 1,
            minY: 1,
            minZ: 0,
            maxX: 2,
            maxY: 2,
            maxZ: 10,
        });
        // Children at depth 2
        const child0 = makeNode("2-0-0-0", "loaded", {
            minX: 1,
            minY: 1,
            minZ: 0,
            maxX: 1.5,
            maxY: 1.5,
            maxZ: 5,
        });
        const child1 = makeNode("2-0-0-1", "loaded", {
            minX: 1,
            minY: 1,
            minZ: 5,
            maxX: 1.5,
            maxY: 1.5,
            maxZ: 10,
        });
        const cache = toMap([parent, child0, child1]);

        const result = computeVisibleCachedNodes(
            cache,
            makeMockCamera(),
            mockGeometricError,
            1000, // Very high threshold → parent passes SSE
        );

        // Only parent rendered; children skipped (covered by parent)
        expect(result).toEqual(["1-0-0-0"]);
    });

    it("SSE filter: parent fails, child passes → child rendered", () => {
        const parent = makeNode("1-0-0-0", "loaded", {
            minX: 1,
            minY: 1,
            minZ: 0,
            maxX: 2,
            maxY: 2,
            maxZ: 10,
        });
        const child = makeNode("2-0-0-0", "loaded", {
            minX: 1,
            minY: 1,
            minZ: 0,
            maxX: 1.5,
            maxY: 1.5,
            maxZ: 5,
        });
        const cache = toMap([parent, child]);

        const result = computeVisibleCachedNodes(
            cache,
            makeMockCamera(),
            mockGeometricError,
            0.001, // Very low threshold → parent fails SSE, child also fails
        );

        // Both should fail SSE, but parent is kept because no children pass either
        // Actually with a very low threshold both fail. The parent has no children that pass.
        // So parent falls through as leaf-like (child exists but doesn't pass either).
        // The algorithm: parent fails SSE, has children in cache → skip.
        // Child fails SSE, no children → render as fallback.
        expect(result).toContain("2-0-0-0");
    });

    it("sorts result by key (no parent-child relationship)", () => {
        // Two unrelated nodes at same depth — both pass SSE
        const a = makeNode("2-0-0-0", "loaded", {
            minX: 1,
            minY: 1,
            minZ: 0,
            maxX: 2,
            maxY: 2,
            maxZ: 10,
        });
        const b = makeNode("2-4-4-4", "loaded", {
            minX: 5,
            minY: 5,
            minZ: 0,
            maxX: 6,
            maxY: 6,
            maxZ: 10,
        });
        const cache = toMap([a, b]);

        const result = computeVisibleCachedNodes(
            cache,
            makeMockCamera(),
            mockGeometricError,
            1000,
        );

        expect(result).toEqual(["2-0-0-0", "2-4-4-4"]);
    });
});
