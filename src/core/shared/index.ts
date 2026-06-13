// Logger — most widely used utility
export { logger } from "./diagnostics/logger";

// Performance instrumentation (no-op when disabled, removable from prod builds)
export { perfTracker, PerfTracker } from "./diagnostics/PerfTracker";
export type { PerfReport } from "./diagnostics/PerfTracker";

// Debounce
export { debounce } from "./async/debounce";

// File download
export { downloadFile } from "./ui/download";

// Async / cancellation
export type { CancellableTask, CancellableReactionResult } from "./async";
export { createCancellable, createCancellableReaction } from "./async";

// Tree traversal
export type { TraverseResult, TraverseOptions } from "./async/treeTraversal";
export { traverseTreeAsync } from "./async/treeTraversal";

// MinHeap (priority queue for point cloud node loading)
export { MinHeap } from "./async/MinHeap";

// Geometry / spatial
export type { Point2D, PointXY, Triangle } from "./geo";
export {
    Bbox,
    flattenTo2D,
    validateBbox,
    unionBbox,
    bboxesIntersect,
    isPointInPolygon,
    polygonBoundingBox,
    isPointInBoundingBox,
    delaunayTriangulate,
    geodesicDistance,
    triangleArea,
    calculatePolygonPerimeter,
} from "./geo";

// Volume calculation
export type { DrapedSurfaceConfig } from "./geo/volume";
export {
    calculateGridTrapezoidVolume,
    SpatialHash,
    BaseSurfaceInterpolator,
    interpolateSurfaceZ,
    formatVolume,
    calculateVolumeFromTin,
} from "./geo/volume";

// Styling / theme
export {
    THEME_PRIMARY,
    THEME_SECONDARY,
    THEME_SUCCESS,
    COLOR_ALPHA_FILL,
    COLOR_ALPHA_STROKE,
    COLOR_ALPHA_PREVIEW,
    getThemeColor,
} from "./ui";

// OGC WFS
export type {
    WfsFeature,
    WfsResponse,
    WfsRequestParams,
} from "./protocols/ogc/wfs";
export { fetchWfsFeatures, fetchWfsPageAsRows } from "./protocols/ogc/wfs";

// OGC WMS
export {
    parseWmsUrl,
    getWmsLayerName,
    buildWmsTileUrl,
    buildWmsFeatureInfoUrl,
} from "./protocols/ogc/wms";
export {
    groupVisibleWmsNodes,
    applyWmsGrouping,
} from "./protocols/ogc/wms/grouper";

// Tile coordinates
export { tileToBBOX, tileToQuadkey, getTilesForBounds } from "./tile";
