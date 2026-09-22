import { describe, expect, it } from "vitest";
import { WebMercatorViewport } from "@deck.gl/core";
import type { Viewport } from "@deck.gl/core";
import type { FrustumPlanes } from "@core/lib/geo";
import {
    buildCameraSnapshot,
    type CameraProviders,
} from "./buildCameraSnapshot";

const PLANES: FrustumPlanes = {
    near: { normal: [0, 0, -1], distance: -1 },
    far: { normal: [0, 0, -1], distance: -1 },
    left: { normal: [0, 0, -1], distance: -1 },
    right: { normal: [0, 0, -1], distance: -1 },
    top: { normal: [0, 0, -1], distance: -1 },
    bottom: { normal: [0, 0, -1], distance: -1 },
};

function makeProviders(viewport: Viewport): CameraProviders {
    return {
        cameraPos: [37.6, 55.75, 100],
        frustumPlanes: PLANES,
        viewport,
        fovDegrees: 60,
        screenHeightPx: 1080,
    };
}

function makeViewport(pitch: number, bearing: number): WebMercatorViewport {
    return new WebMercatorViewport({
        width: 800,
        height: 600,
        longitude: 37.6,
        latitude: 55.75,
        zoom: 15,
        pitch,
        bearing,
    });
}

describe("buildCameraSnapshot", () => {
    it("derives the look direction from the view matrix", () => {
        const camera = buildCameraSnapshot(makeProviders(makeViewport(60, 0)));

        expect(camera.cameraDirection[0]).toBeCloseTo(0, 6);
        expect(camera.cameraDirection[1]).toBeCloseTo(
            Math.sin((60 * Math.PI) / 180),
            6,
        );
        expect(camera.cameraDirection[2]).toBeCloseTo(
            -Math.cos((60 * Math.PI) / 180),
            6,
        );
    });

    it("points straight down for a top-down camera", () => {
        const camera = buildCameraSnapshot(makeProviders(makeViewport(0, 0)));

        expect(camera.cameraDirection[0]).toBeCloseTo(0, 6);
        expect(camera.cameraDirection[1]).toBeCloseTo(0, 6);
        expect(camera.cameraDirection[2]).toBeCloseTo(-1, 6);
    });

    it("converts fovDegrees to radians", () => {
        const camera = buildCameraSnapshot({
            ...makeProviders(makeViewport(0, 0)),
            fovDegrees: 45,
        });

        expect(camera.fovRadians).toBeCloseTo(Math.PI / 4, 10);
    });

    it("falls back to straight down for a degenerate direction", () => {
        const camera = buildCameraSnapshot(
            makeProviders({
                center: [1, 2, 3],
                cameraPosition: [1, 2, 3],
                projectPosition: (xyz: number[]) => [xyz[0], xyz[1], xyz[2]],
            } as unknown as Viewport),
        );

        expect(camera.cameraDirection).toEqual([0, 0, -1]);
    });
});
