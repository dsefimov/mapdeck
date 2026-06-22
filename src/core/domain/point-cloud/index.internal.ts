/**
 * Internal exports for tests and cross-module access.
 * NOT part of the public API — no stability guarantees.
 */
export { computeRootSpacing, computeGeometricError, buildProjection } from "./geometry";
export { projectNodeBoundsToCommonSpace, isAabbInFrustumPlanes } from "./geometry";
export { projectAabbToMeters, computeDistanceToCamera } from "./geometry";
export { lngLatToWebMercator } from "./geometry";
export { computeBoundingSphereRadius, computeScreenProjectedArea } from "./geometry";
export { computeGroundResolution, MIN_GROUND_RES } from "./geometry";
export type { RootSpacingInput, DynamicSSEOptions } from "./geometry";
export { metersPerDegreeAt } from "./geometry";
export { clampLatLng } from "./geometry";
export { extractProjcsFromWkt } from "./geometry";
export { computeMaxDepthForNode } from "./traversal";
export { updateTileAncestorContentLinks } from "./traversal";
export { updatePriority } from "./priority/updatePriority";
export { clearTileData } from "./eviction/clearTileData";
