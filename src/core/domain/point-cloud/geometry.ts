/**
 * Pure geometry functions for point-cloud SSE-based LOD.
 * All functions are deterministic: same input → same output. No side effects.
 */

import proj4 from "proj4";

export interface BBox3D {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
}

/** A single plane: normal (unit vector) + signed distance from origin. */
export interface FrustumPlane {
    distance: number;
    normal: [number, number, number];
}

/** Six frustum planes in deck.gl world coordinates (Web Mercator meters). */
export interface FrustumPlanes {
    near: FrustumPlane;
    far: FrustumPlane;
    left: FrustumPlane;
    right: FrustumPlane;
    top: FrustumPlane;
    bottom: FrustumPlane;
}

/** Immutable camera state for a single traversal/render frame. */
export interface CameraSnapshot {
    frustumPlanes: FrustumPlanes;
    cameraPos: [number, number, number];
    fovRadians: number;
    projectToCommonSpace: ProjectToCommonSpace;
    centerOffset: CenterOffset;
    screenHeightPx: number;
}

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

/** Project WGS84 [lng, lat, alt] to deck.gl common space via viewport.projectPosition(). */
export type ProjectToCommonSpace = (
    lng: number,
    lat: number,
    alt: number,
) => [number, number, number];

/** Center offset from viewport.center — world-coordinate origin for frustum planes. */
export type CenterOffset = [number, number, number];

/**
 * Project a node's WGS84 AABB into the frustum-test coordinate space.
 * Projects all 8 corners via projectToCommonSpace, offsets by centerOffset,
 * and subtracts camCommonZ to align with the frustum plane coordinate system.
 */
export function projectNodeBoundsToCommonSpace(
    boundsWgs84: BBox3D,
    projectToCommonSpace: ProjectToCommonSpace,
    centerOffset: CenterOffset,
    camCommonZ: number,
): BBox3D {
    const corners: [number, number, number][] = [];
    for (const cx of [boundsWgs84.minX, boundsWgs84.maxX]) {
        for (const cy of [boundsWgs84.minY, boundsWgs84.maxY]) {
            for (const cz of [boundsWgs84.minZ, boundsWgs84.maxZ]) {
                const c = projectToCommonSpace(cx, cy, cz);
                corners.push([
                    c[0] - centerOffset[0],
                    c[1] - centerOffset[1],
                    c[2] - camCommonZ,
                ]);
            }
        }
    }
    return {
        minX: Math.min(...corners.map((c) => c[0])),
        minY: Math.min(...corners.map((c) => c[1])),
        minZ: Math.min(...corners.map((c) => c[2])),
        maxX: Math.max(...corners.map((c) => c[0])),
        maxY: Math.max(...corners.map((c) => c[1])),
        maxZ: Math.max(...corners.map((c) => c[2])),
    };
}

/**
 * Test if a 3D AABB intersects the camera frustum defined by 6 planes.
 * Uses the p-vertex trick: for each plane, the farthest corner along the
 * normal is tested. If even that corner is behind the plane, the AABB is
 * entirely outside the frustum.
 *
 * @param bboxMercator - Node AABB in Web Mercator meters (Z unchanged).
 * @param planes - Frustum planes from deck.gl Viewport.getFrustumPlanes().
 */
export function isAabbInFrustumPlanes(
    bboxMercator: BBox3D,
    planes: FrustumPlanes,
): boolean {
    // Test 4 side planes only (near and far excluded).
    // Near — point clouds are volumetric, camera can be inside the cloud.
    // Far — governs render distance, not load distance; high-altitude
    // parents must be traversed to reach lower-altitude children.
    //
    // deck.gl normals point OUTWARD (getFrustumPlane negates Gribb/Hartmann).
    // With outward normals, n·p + d > 0 means outside → test dist > EPS.
    //
    // Deck.gl side-plane distances have signs that vary with bearing.
    // Rule: planes with distance > 0 give center outside → negate them.
    // This normalizes all distances to negative → center passes all planes.
    //
    // Planes are in common space; coords must be offset by vp.center (caller).
    // EPS=0.1 (~5000m margin at mid-latitudes) prevents edge-of-frustum
    // false culling of tiles that are just outside the strict plane boundary.
    const EPS = 0.1;
    const fixDist = (d: number): number => (d > 0 ? -d : d);
    const planesList: FrustumPlane[] = [
        { ...planes.left, distance: fixDist(planes.left.distance) },
        { ...planes.right, distance: fixDist(planes.right.distance) },
        { ...planes.top, distance: fixDist(planes.top.distance) },
        { ...planes.bottom, distance: fixDist(planes.bottom.distance) },
    ];

    for (const plane of planesList) {
        const [nx, ny, nz] = plane.normal;
        // Negative vertex: the AABB corner MINIMIZING n·p + d.
        // With outward normals, n·p + d > 0 means outside.
        // If even the minimum is > EPS, the entire AABB is outside.
        const nvx = nx < 0 ? bboxMercator.maxX : bboxMercator.minX;
        const nvy = ny < 0 ? bboxMercator.maxY : bboxMercator.minY;
        const nvz = nz < 0 ? bboxMercator.maxZ : bboxMercator.minZ;

        const dist = nx * nvx + ny * nvy + nz * nvz + plane.distance;
        if (dist > EPS) {
            return false;
        }
    }
    return true;
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
 * Project geometric error (meters) to screen-space error (pixels).
 * All linear inputs must be in meters.
 */
export function computeScreenError(
    geometricError: number,
    distanceToCamera: number,
    fovVerticalRadians: number,
    screenHeightPx: number,
): number {
    if (distanceToCamera <= 0) return Infinity;
    return (
        (geometricError * screenHeightPx) /
        (2 * distanceToCamera * Math.tan(fovVerticalRadians / 2))
    );
}

/**
 * Half-diagonal of a 3D AABB (bounding sphere radius). Input in meters.
 */
export function computeBoundingSphereRadius(bboxMeters: BBox3D): number {
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
