export { DeckOverlayManager, overlayManager } from "./DeckOverlayManager";

// Point cloud loader exports
export { CopcStreamingLoader } from "./loaders/CopcStreamingLoader";
export type { PointCloudData, LoaderOptions } from "@core/framework/types";
export type {
    StreamingSource,
    StreamingLoaderOptions,
    ViewportInfo,
} from "@core/framework/types";

// Viewport manager for streaming
export { ViewportManager } from "./ViewportManager";
export type { ViewportManagerOptions } from "./ViewportManager";

// Layer factories export
export { PointCloudLayerFactory } from "./layers/PointCloudLayerFactory";

// Convenience re-exports for deck.gl types
export type { Layer } from "@deck.gl/core";
export type { MapboxOverlay } from "@deck.gl/mapbox";

// Picking and measurement utilities
export {
    parseChunkInfo,
    getPointFromPickingInfo,
    pickPointFromCloud,
    getPointWithFallback,
    type PickingInfo,
    type PickingResult,
} from "./picking";
export {
    formatDistance,
    formatArea,
    convertPointToDegrees,
} from "./measurements";

// Render sync utilities
export {
    buildDesiredRenderUnits,
    buildGroupedRenderUnits,
    getNativeRenderOrder,
} from "./sync";
