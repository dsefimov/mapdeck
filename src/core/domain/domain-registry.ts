/**
 * Domain part of the single access point: domain stores and factories,
 * without the common subsystems.
 */
import type { LayerTreeStore, ToolStore } from "./layer-tree";
import type {
    BasemapStore,
    MapStore,
    MapToolStore,
} from "./map";
import type {
    FeatureProviderRegistry,
    ProtocolRegistry,
    SourceAdapterFactory,
} from "./protocols";

/** Domain stores and registries of the single access point. */
export interface DomainRegistry {
    readonly sourceAdapterFactory: SourceAdapterFactory;
    readonly protocolRegistry: ProtocolRegistry;
    readonly featureProviderRegistry: FeatureProviderRegistry;
    readonly treeStore: LayerTreeStore;
    readonly layerToolStore: ToolStore;
    readonly mapStore: MapStore;
    readonly basemapStore: BasemapStore;
    readonly mapToolStore: MapToolStore;
}
