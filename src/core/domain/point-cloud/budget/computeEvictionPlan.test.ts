import { describe, it, expect } from "vitest";
import { computeEvictionPlan } from "./computeEvictionPlan";
import {
    buildProjection,
    projectAabbToMeters,
    computeDistanceToCamera,
} from "../geometry";
import type { CachedNode } from "@core/framework/types";

// eslint-disable-next-line max-params
function makeNode(
    key: string,
    pointCount: number,
    lng: number,
    lat: number,
    altMin: number,
    altMax: number,
): CachedNode {
    return {
        key,
        keyArray: key.split("-").map(Number) as [
            number,
            number,
            number,
            number,
        ],
        state: "loaded",
        pointCount,
        pointDataOffset: 0,
        pointDataLength: 0,
        bounds: {
            minX: lng,
            minY: lat,
            minZ: altMin,
            maxX: lng + 0.001,
            maxY: lat + 0.001,
            maxZ: altMax,
        },
        boundsWgs84: {
            minX: lng,
            minY: lat,
            minZ: altMin,
            maxX: lng + 0.001,
            maxY: lat + 0.001,
            maxZ: altMax,
        },
        positions: new Float32Array(pointCount * 3),
    };
}

function toMap(nodes: CachedNode[]): Map<string, CachedNode> {
    return new Map(nodes.map((n) => [n.key, n]));
}

describe("computeEvictionPlan", () => {
    const cameraLng = -122.4;
    const cameraLat = 37.8;
    const cameraAlt = 500;
    const projector = buildProjection(cameraLng, cameraLat);
    const [cx, cy] = projector.forward([cameraLng, cameraLat]);
    const cameraPosMeters: [number, number, number] = [cx, cy, cameraAlt];

    it("evicts farthest node first", () => {
        const cache = toMap([
            makeNode("A-close", 100, cameraLng, cameraLat, 0, 10),
            makeNode("B-far", 200, cameraLng + 0.01, cameraLat, 0, 10),
            makeNode("C-farthest", 300, cameraLng + 0.02, cameraLat, 0, 10),
        ]);
        const plan = computeEvictionPlan(
            cache,
            200,
            cameraPosMeters,
            projector,
        );
        expect(plan.keysToEvict).toContain("C-farthest");
        expect(plan.keysToEvict).not.toContain("A-close");
    });

    it("evicts multiple far nodes when needed", () => {
        const cache = toMap([
            makeNode("A-close", 100, cameraLng, cameraLat, 0, 10),
            makeNode("B-far", 150, cameraLng + 0.01, cameraLat, 0, 10),
            makeNode("C-mid", 120, cameraLng + 0.005, cameraLat, 0, 10),
        ]);
        const plan = computeEvictionPlan(
            cache,
            200,
            cameraPosMeters,
            projector,
        );
        expect(plan.keysToEvict).toEqual(["B-far", "C-mid"]);
        expect(plan.keysToEvict).not.toContain("A-close");
    });

    it("distance increases with horizontal offset", () => {
        const nodeClose = makeNode("close", 100, cameraLng, cameraLat, 0, 0);
        const nodeFar = makeNode("far", 100, cameraLng + 0.02, cameraLat, 0, 0);
        const distClose = computeDistanceToCamera(
            cameraPosMeters,
            projectAabbToMeters(nodeClose.boundsWgs84, projector),
        );
        const distFar = computeDistanceToCamera(
            cameraPosMeters,
            projectAabbToMeters(nodeFar.boundsWgs84, projector),
        );
        expect(distFar).toBeGreaterThan(distClose);
    });
});
