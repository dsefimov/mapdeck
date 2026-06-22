/**
 * Pure functions for coordinate projection and distance computation.
 * All functions are deterministic: same input → same output. No side effects.
 */

import proj4 from "proj4";
import type { BBox3D } from "@core/framework/types";

/** Project WGS84 [lng, lat, alt] to deck.gl common space via viewport.projectPosition(). */
export type ProjectToCommonSpace = (
    lng: number,
    lat: number,
    alt: number,
) => [number, number, number];

/** Center offset from viewport.center — world-coordinate origin for frustum planes. */
export type CenterOffset = [number, number, number];

const WEB_MERCATOR_R = 6378137;
const DEG2RAD = Math.PI / 180;

/**
 * Convert WGS84 longitude/latitude to Web Mercator meters (EPSG:3857).
 * Z values pass through unchanged (already in meters).
 */
export function lngLatToWebMercator(
    lng: number,
    lat: number,
): [number, number] {
    const x = WEB_MERCATOR_R * lng * DEG2RAD;
    const y =
        WEB_MERCATOR_R * Math.log(Math.tan(Math.PI / 4 + (lat * DEG2RAD) / 2));
    return [x, y];
}

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

    return {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        minZ: bboxDeg.minZ,
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
        maxZ: bboxDeg.maxZ,
    };
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

/**
 * Half-diagonal of a 3D AABB (bounding sphere radius). Input in meters.
 */
export function computeBoundingSphereRadius(
    bboxMeters: BBox3D,
): number {
    const dx = bboxMeters.maxX - bboxMeters.minX;
    const dy = bboxMeters.maxY - bboxMeters.minY;
    const dz = bboxMeters.maxZ - bboxMeters.minZ;
    return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2;
}

/**
 * Approximate screen-projected area of a node using its bounding sphere.
 * All linear inputs in meters. Result in square pixels.
 */
export function computeScreenProjectedArea(
    boundingSphereRadius: number,
    distanceToCamera: number,
    fovVerticalRadians: number,
    screenHeightPx: number,
): number {
    if (distanceToCamera <= 0) return Infinity;
    const projectedRadius =
        (boundingSphereRadius / distanceToCamera) *
        (screenHeightPx / (2 * Math.tan(fovVerticalRadians / 2)));
    return Math.PI * projectedRadius * projectedRadius;
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
