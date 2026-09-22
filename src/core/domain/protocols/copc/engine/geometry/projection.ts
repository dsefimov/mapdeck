/**
 * Pure functions for coordinate projection and distance computation.
 * All functions are deterministic: same input → same output. No side effects.
 */

import proj4 from "proj4";
import { Bbox, type BBox3D } from "@core/lib/geo";
import { metersPerDegreeAt } from "./geoMath";
import { clampLatLng } from "./wgs84";

/** Project WGS84 [lng, lat, alt] to deck.gl common space via viewport.projectPosition(). */
export type ProjectToCommonSpace = (
    lng: number,
    lat: number,
    alt: number,
) => [number, number, number];

/** Input for root spacing calculation — subset of COPC metadata actually needed. */
export interface RootSpacingInput {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
    spacing: number;
    totalPoints: number;
}

/**
 * Compute the characteristic spacing (inter-point distance at depth 0).
 * 3-tier fallback:
 * 1. Explicit `spacing` field — most accurate.
 * 2. Density estimate `cbrt(volume / totalPoints)`.
 * 3. Conservative `rootBBoxDiagonal / 2`.
 */
export function computeRootSpacing(input: RootSpacingInput): number {
    if (input.spacing > 0) {
        return input.spacing;
    }

    const { minX, minY, minZ, maxX, maxY, maxZ, totalPoints } = input;
    const dx = maxX - minX;
    const dy = maxY - minY;
    const dz = maxZ - minZ;
    const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const volume = dx * dy * dz;
    if (volume > 0 && totalPoints > 0) {
        return Math.cbrt(volume / totalPoints);
    }

    return diagonal > 0 ? diagonal / 2 : 1;
}

/**
 * Geometric error at depth D: rootSpacing / 2^D.
 * Represents characteristic voxel size at that depth **in meters**.
 */
export function computeGeometricError(
    rootSpacing: number,
    depth: number,
): number {
    return rootSpacing / Math.pow(2, depth);
}

/** Root-spacing input plus the CRS flag that decides the degrees→meters conversion. */
export interface RootSpacingMetersInput extends RootSpacingInput {
    needsTransform: boolean;
}

/**
 * Root spacing in meters.
 *
 * When data is in WGS84 degrees (no CRS transform), the degree-valued spacing
 * is converted to meters at the extent's center latitude so that
 * geometricError(depth) produces meter values consistent with
 * distanceToCamera (also in meters).
 */
export function computeRootSpacingMeters(
    input: RootSpacingMetersInput,
): number {
    const rootSpacing = computeRootSpacing(input);
    if (!input.needsTransform && rootSpacing > 0) {
        const centerLat = (input.minY + input.maxY) / 2;
        return rootSpacing * metersPerDegreeAt(centerLat);
    }
    return rootSpacing;
}

/**
 * Build a proj4 converter from WGS84 to azimuthal equidistant (aeqd)
 * centered on the current camera position. Called once per traversal.
 */
export function buildProjection(
    cameraLng: number,
    cameraLat: number,
): proj4.Converter {
    const projDef = `+proj=aeqd +lat_0=${cameraLat} +lon_0=${cameraLng} +units=m`;
    return proj4("EPSG:4326", projDef);
}

/**
 * Project AABB corners from WGS84 to meters using the provided proj4 converter.
 * Z passes through unchanged (already in meters).
 */
export function projectAabbToMeters(
    bboxDeg: BBox3D,
    projector: proj4.Converter,
): BBox3D {
    const corners: Array<[number, number]> = [
        [bboxDeg.minX, bboxDeg.minY],
        [bboxDeg.minX, bboxDeg.maxY],
        [bboxDeg.maxX, bboxDeg.minY],
        [bboxDeg.maxX, bboxDeg.maxY],
    ];

    const projected = corners.map((c) => projector.forward(c));

    const xs = projected.map((p) => p[0]);
    const ys = projected.map((p) => p[1]);

    return Bbox.fromCorners({
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        minZ: bboxDeg.minZ,
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
        maxZ: bboxDeg.maxZ,
    });
}

/** Geometric center of an AABB. */
export function bboxCenter(bbox: BBox3D): [number, number, number] {
    return [
        (bbox.minX + bbox.maxX) / 2,
        (bbox.minY + bbox.maxY) / 2,
        (bbox.minZ + bbox.maxZ) / 2,
    ];
}

/**
 * Euclidean 3D distance from camera to the closest point on the node's AABB.
 * Both inputs must already be in meters (after projection).
 */
export function computeDistanceToCamera(
    cameraPosMeters: [number, number, number],
    bboxMeters: BBox3D,
): number {
    const cx = Math.max(
        bboxMeters.minX,
        Math.min(cameraPosMeters[0], bboxMeters.maxX),
    );
    const cy = Math.max(
        bboxMeters.minY,
        Math.min(cameraPosMeters[1], bboxMeters.maxY),
    );
    const cz = Math.max(
        bboxMeters.minZ,
        Math.min(cameraPosMeters[2], bboxMeters.maxZ),
    );

    const dx = cameraPosMeters[0] - cx;
    const dy = cameraPosMeters[1] - cy;
    const dz = cameraPosMeters[2] - cz;

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Minimum ground resolution (meters/pixel) to prevent NaN/Infinity. */
export const MIN_GROUND_RES = 0.001;

/**
 * Ground resolution at a given 3D distance from the camera (meters/pixel).
 * Used per-node by the anti-overzoom guard.
 */
export function computeGroundResolution(
    distanceToCamera: number,
    fovVerticalRadians: number,
    screenHeightPx: number,
): number {
    if (screenHeightPx <= 0) return MIN_GROUND_RES;
    return (
        (distanceToCamera * 2 * Math.tan(fovVerticalRadians / 2)) /
        screenHeightPx
    );
}

/**
 * Re-project a node cell's horizontal extent to WGS84 via its SW/NE corners.
 *
 * Node cells are small relative to the source extent, so two corners suffice
 * here where the extent-level `computeWgs84Bounds` (initialization) samples
 * the whole outline. Corners may swap sides under projection, hence the
 * min/max folding. Altitude passes through unchanged.
 */
export function transformNodeBoundsToWgs84(
    transformer: (coord: [number, number]) => [number, number],
    bounds: BBox3D,
): BBox3D {
    const [swLng, swLat] = clampLatLng(
        ...transformer([bounds.minX, bounds.minY]),
    );
    const [neLng, neLat] = clampLatLng(
        ...transformer([bounds.maxX, bounds.maxY]),
    );
    return Bbox.fromCorners({
        minX: Math.min(swLng, neLng),
        minY: Math.min(swLat, neLat),
        minZ: bounds.minZ,
        maxX: Math.max(swLng, neLng),
        maxY: Math.max(swLat, neLat),
        maxZ: bounds.maxZ,
    });
}
