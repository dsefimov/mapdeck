/**
 * Barrel exports for all core types
 * Use this for importing types from the core layer
 */

// === Geo types ===
export type { Point2D, GeoJSONGeometry } from "./geo";
export { Bbox } from "./geo";

// === Framework types ===
export type {
    Widget,
    WidgetComponent,
    WidgetContext,
    WidgetSizeConfig,
    WidgetBaseConfig,
    WidgetConfig,
    WidgetSize,
} from "./framework";
export type { Module } from "./framework";
export type { SupportedLanguage, TranslationDict } from "./framework/locale";
export { DEFAULT_LANGUAGE, LOCALE_KEY_TOOL_NAME } from "./framework/locale";
export type {
    SettingType,
    SettingOption,
    SettingMetadata,
    RegisteredSetting,
    SettingsGroup,
} from "./framework/settings";
export type {
    MapTool,
    MapActionTool,
    AnyMapTool,
    MapToolComponentProps,
    MapToolPlacement,
    BaseMapTool,
} from "./framework/tools";
export { isMapTool, isMapActionTool } from "./framework/tools";

// === Domain types ===
export type { LayerRole } from "./domain/layer";
export { LayerRoles, BUILT_IN_ROLES } from "./domain/layer";
export type {
    LayerConfig,
    LayerConfigBase,
    LayerConfigFor,
    LayerConfigRegistry,
    RasterLayerConfig,
    VectorLayerConfig,
    PointCloudLayerConfig,
    Vector3DLayerConfig,
    LayerAdapter,
    LayerTool,
    LayerToolRole,
    RenderUnit,
    SnapshotItem,
    RenderDescriptor,
} from "./domain/layer";
export {
    isRasterConfig,
    isVectorConfig,
    isPointCloudConfig,
    isVector3DConfig,
    makeRenderDescriptor,
    updateDescriptorConfig,
    isDescriptorRole,
} from "./domain/layer";

export type {
    NodeRole,
    NodeRoleCategory,
    NodeAttributeConfig,
    DisplayRole,
    AttributeRole,
    ReportRole,
    NodeRoles,
    LayerNodeRoles,
    TreeNode,
    TreeNodeBase,
    GroupNode,
    LayerNode,
} from "./domain/node";
export { LayerTreeNodeTypes, isGroupNode, isLayerNode } from "./domain/node";

export type { DataSourceConfig, SourceAdapter } from "./domain/source";

export type {
    AttributeDataAdapter,
    AttributeSourceConfig,
    AttributeFetchRequest,
    AttributeFetchResult,
    AttributeCacheEntry,
} from "./domain/attribute";

// === OGC types ===
export type {
    WmsOptions,
    WmsGroupKey,
    WmsGroupConfig,
    ParsedWmsUrl,
} from "./ogc/wms";
export type { WfsFeature, WfsResponse, WfsRequestParams } from "./ogc/wfs";

// === Data types ===
export type { PointCloudData, LoaderOptions } from "./data";
export { hasRGB, hasIntensity, hasClassification, ColorScheme } from "./data";

export type {
    CopcLoadingMode,
    NodeKey,
    StreamingLoaderOptions,
    StreamingSource,
    PointCloudBounds,
    NodeState,
    CachedNode,
    ViewportInfo,
    StreamingLoadOptions,
    AttributeArray,
    ExtraPointAttributes,
    CopcMetadata,
    DimensionInfo,
} from "./data";

export type { MeasurementPoint3D, VolumeMeasurements } from "./data";

// === Overlay types ===
export type { OverlayConfig, ManagedLayer, OverlayManager } from "./framework";

// === Config types ===
export type { BaseMapConfig, BaseMapSettings } from "./config/config";
