// Adapter factories for the modular architecture
export { LayerAdapterFactory } from "./layer/LayerAdapterFactory";
export { SourceAdapterFactory } from "./source/SourceAdapterFactory";
export { AttributeAdapterFactory } from "./attribute/AttributeAdapterFactory";

// Layer adapter implementations
export { RasterAdapter } from "./layer/impl/RasterAdapter";
export { VectorAdapter } from "./layer/impl/VectorAdapter";
export { PointCloudAdapter } from "./layer/impl/PointCloudAdapter";

// Layer adapter registration
export { registerLayerAdapters } from "./layer/registerLayerAdapters";
export {
    LayerConfigRegistry,
    registerDefaultLayerConfigs,
} from "./layer/createDefaultLayerConfig";

// Attribute adapter registration
export { registerAttributeAdapters } from "./attribute/registerAttributeAdapters";

// Attribute data adapters
export { WfsAttributeAdapter } from "./attribute/impl/WfsAttributeAdapter";

// Re-export adapter interfaces for convenience
export type { SourceAdapter } from "@core/framework/types";
export type {
    AttributeDataAdapter,
    AttributeSourceConfig,
    AttributeFetchRequest,
    AttributeFetchResult,
} from "@core/framework/types";
