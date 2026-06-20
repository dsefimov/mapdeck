export { CopcStreamingLoader } from "./CopcStreamingLoader";
export type { PointCloudData, LoaderOptions } from "@core/framework/types";
export type {
    StreamingSource,
    StreamingLoaderOptions,
    ViewportInfo,
} from "@core/framework/types";

export { ViewportManager } from "./ViewportManager";
export type { ViewportManagerOptions } from "./ViewportManager";

export { PointCloudLayerFactory } from "./PointCloudLayerFactory";

export {
    parseChunkInfo,
    getPointFromPickingInfo,
    pickPointFromCloud,
    getPointWithFallback,
    type PickingInfo,
    type PickingResult,
} from "./picking";

export { WorkerPool } from "./workers/WorkerPool";

// New SSE-based pure functions
export {
    computeRootSpacing,
    computeGeometricError,
    buildProjection,
    projectNodeBoundsToCommonSpace,
    projectAabbToMeters,
    computeDistanceToCamera,
    computeScreenError,
    lngLatToWebMercator,
    isAabbInFrustumPlanes,
    computeBoundingSphereRadius,
    computeScreenProjectedArea,
    computeGroundResolution,
    MIN_GROUND_RES,
    type BBox3D,
    type CameraSnapshot,
    type RootSpacingInput,
    type FrustumPlane,
    type FrustumPlanes,
} from "./geometry";

export {
    traverseOctree,
    computeMaxDepthForNode,
    type CandidateNode,
    type TraversalResult,
} from "./traversal";

export { computeBudgetPlan, computeEvictionPlan } from "./budget";

export type { BudgetPlan, EvictionPlan } from "@core/framework/types";

export { computeVisibleCachedNodes } from "./render";

export {
    HierarchyLoadTracker,
    type OnNodesDiscovered,
} from "./hierarchy/HierarchyLoadTracker";

export { type DeviceTier, type EffectiveBaseline } from "./adaptiveBudget";
