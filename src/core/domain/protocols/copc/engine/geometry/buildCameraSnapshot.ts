/**
 * Build a CameraSnapshot from resolved provider values.
 * Pure function — all null checks happen before calling.
 */

import type { CameraSnapshot } from "./frustum";
import type { FrustumPlanes } from "@core/lib/geo";
import type { ProjectToCommonSpace } from "./projection";
import type { MapContext } from "@core/contracts";

/**
 * Deck viewport type obtained through the map context's return types —
 * the engine names no deck import (ADR-0010).
 */
export type Viewport = NonNullable<
    ReturnType<NonNullable<MapContext["getActiveViewport"]>>
>;

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

function normalizeDirection(
    v: [number, number, number],
): [number, number, number] {
    const length = Math.hypot(v[0], v[1], v[2]);
    if (length < 1e-9) return [0, 0, -1];
    return [v[0] / length, v[1] / length, v[2] / length];
}

function getCameraDirection(viewport: Viewport): [number, number, number] {
    const [cx = 0, cy = 0, cz = 0] = viewport.center ?? [];
    const [px = 0, py = 0, pz = 0] = viewport.cameraPosition ?? [];
    return normalizeDirection([cx - px, cy - py, cz - pz]);
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

    const projectToCommonSpace: ProjectToCommonSpace = (lng, lat, alt) =>
        viewport.projectPosition([lng, lat, alt]) as [number, number, number];

    const cameraDirection = getCameraDirection(viewport);

    return {
        frustumPlanes,
        cameraPos,
        cameraDirection,
        fovRadians: (fovDegrees * Math.PI) / 180,
        projectToCommonSpace,
        screenHeightPx,
        pixelRatio:
            typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    };
}
