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

/** Dynamic SSE configuration. */
export interface DynamicSSEOptions {
    enabled: boolean;
    /** Fog density factor (default 2.0e-4). Model: dynamicScreenSpaceErrorDensity. */
    density?: number;
    /** Factor applied to fog reduction (default 24.0). Model: dynamicScreenSpaceErrorFactor. */
    factor?: number;
    /**
     * Fraction of the tileset's own height range used for heightClose calculation
     * (default 0.25). Model: dynamicScreenSpaceErrorHeightFalloff.
     */
    heightFalloff?: number;
    /** Minimum Z of the tileset's root bounding volume (WGS84 meters). */
    tilesetMinHeight: number;
    /** Maximum Z of the tileset's root bounding volume (WGS84 meters). */
    tilesetMaxHeight: number;
}

/**
 * Compute screen-space error for a tile.
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
    if (distanceToCamera <= 0) return Infinity;

    const { fovVerticalRadians, screenHeightPx, pixelRatio } = camera;
    const sseDenominator = 2.0 * Math.tan(fovVerticalRadians / 2.0);

    let error =
        (geometricError * screenHeightPx) / (distanceToCamera * sseDenominator);
    error /= pixelRatio;
    return error;
}
