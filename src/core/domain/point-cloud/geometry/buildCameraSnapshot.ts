/**
 * Build a CameraSnapshot from resolved provider values.
 * Pure function — all null checks happen before calling.
 */

import type {
    CameraSnapshot,
    FrustumPlanes,
    ProjectToCommonSpace,
    CenterOffset,
} from "./frustum";
import type { Viewport } from "@deck.gl/core";

/**
 * Resolved camera data providers (all non-null after upstream checks).
 */
export interface CameraProviders {
    cameraPos: [number, number, number];
    frustumPlanes: FrustumPlanes;
    viewport: Viewport;
    fovDegrees: number;
    screenHeightPx: number;
}

/**
 * Construct a CameraSnapshot from resolved provider values.
 * No branching — all guards happen in the caller.
 */
export function buildCameraSnapshot(
    providers: CameraProviders,
): CameraSnapshot {
    const { cameraPos, frustumPlanes, viewport, fovDegrees, screenHeightPx } =
        providers;

    const [cx = 0, cy = 0, cz = 0] = viewport.center ?? [];
    const centerOffset: CenterOffset = [cx, cy, cz];
    const projectToCommonSpace: ProjectToCommonSpace = (lng, lat, alt) =>
        viewport.projectPosition([lng, lat, alt]) as [number, number, number];

    // Extract camera look direction from deck.gl viewport pitch/bearing.
    const vp = viewport as unknown as Record<string, unknown>;
    const pitch = typeof vp.pitch === "number" ? vp.pitch : 0;
    const bearing = typeof vp.bearing === "number" ? vp.bearing : 0;
    const pitchRad = (pitch * Math.PI) / 180;
    const bearingRad = (bearing * Math.PI) / 180;
    const cameraDirection: [number, number, number] = [
        -Math.sin(pitchRad) * Math.sin(bearingRad),
        -Math.sin(pitchRad) * Math.cos(bearingRad),
        -Math.cos(pitchRad),
    ];

    return {
        frustumPlanes,
        cameraPos,
        cameraDirection,
        fovRadians: (fovDegrees * Math.PI) / 180,
        projectToCommonSpace,
        centerOffset,
        screenHeightPx,
        pixelRatio:
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        camCommonZ: projectToCommonSpace(
            cameraPos[0],
            cameraPos[1],
            cameraPos[2],
        )[2],
    };
}
