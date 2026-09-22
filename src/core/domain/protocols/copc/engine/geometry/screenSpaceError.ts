/**
 * Screen-space error computation.
 */

/**
 * Camera context for screen-space error computation.
 * Extracted subset of CameraSnapshot relevant to SSE.
 */
export interface SSECameraContext {
    /** Vertical field of view in radians. */
    fovVerticalRadians: number;
    /** Screen (drawing buffer) height in pixels. */
    screenHeightPx: number;
    /** Device pixel ratio (for HiDPI displays). */
    pixelRatio: number;
}

/**
 * Compute screen-space error for a tile.
 *
 * A distance at or below zero yields `Infinity`: the camera sits inside the
 * node, which therefore always refines. An unresolved distance is named
 * separately and joins that branch — left to fall through it would return NaN,
 * and NaN reads as "within the threshold" at every comparison, so the node
 * would be dropped from the render set rather than kept for another look.
 *
 * @param geometricError - Geometric error in meters (voxel size at this depth).
 * @param distanceToCamera - Euclidean 3D distance from camera to AABB in meters.
 * @param camera - Camera context (fov, screen height, pixel ratio).
 * @returns Screen-space error in pixels.
 */
export function getScreenSpaceError(
    geometricError: number,
    distanceToCamera: number,
    camera: SSECameraContext,
): number {
    if (Number.isNaN(distanceToCamera) || distanceToCamera <= 0) {
        return Infinity;
    }

    const { fovVerticalRadians, screenHeightPx, pixelRatio } = camera;
    const sseDenominator = 2.0 * Math.tan(fovVerticalRadians / 2.0);

    let error =
        (geometricError * screenHeightPx) / (distanceToCamera * sseDenominator);
    error /= pixelRatio;
    return error;
}
