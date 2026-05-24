import type maplibregl from "maplibre-gl";
import { comparer, runInAction, reaction } from "mobx";

import { logger } from "@core/shared/diagnostics/logger";
import type { LayerConfig, RenderUnit } from "@core/framework/types";
import type { RootStore } from "@core/framework/store";
import {
    buildGroupedRenderUnits,
    getNativeRenderOrder,
} from "@core/domain/overlay/sync";

/**
 * Modern adapter-based Layer Manager
 *
 * Uses NodeRole system: gets active display role from node,
 * delegates operations to appropriate adapters by layer role.
 */
export class LayerManager {
    private map: maplibregl.Map | null = null;
    private rootStore: RootStore;
    private disposers: (() => void)[] = [];
    private isInitialized = false;
    private isMapLoaded = false;

    /**
     * Unified registry of render units on the map.
     * Key = nodeId (single) or groupId (future WMS groups).
     */
    private renderUnits = new Map<string, RenderUnit>();

    constructor(rootStore: RootStore) {
        this.rootStore = rootStore;
    }

    // ==================== Lifecycle ====================

    initialize(map: maplibregl.Map): void {
        if (this.isInitialized) {
            logger.warn("LayerManager already initialized");
            return;
        }

        this.map = map;
        this.isInitialized = true;

        this.setupMapLoadListener();
        this.setupReactiveSync();
    }

    dispose(): void {
        this.disposers.forEach((disposer) => disposer());
        this.disposers = [];

        for (const unit of this.renderUnits.values()) {
            this._removeRenderUnit(unit);
        }

        this.map = null;
        this.isInitialized = false;
        this.renderUnits.clear();
    }

    // ==================== Diff-based sync ====================

    /**
     * Sync all layers with current layer tree state using diff logic.
     * Layer grouping is handled by buildGroupedRenderUnits.
     */
    private syncAllLayers(): void {
        if (!this.map || !this.isInitialized || !this.isMapLoaded) return;

        runInAction(() => {
            try {
                const snapshot = this.rootStore.treeStore.layerSnapshot;
                const desired = buildGroupedRenderUnits(
                    snapshot,
                    this.rootStore.layerAdapterFactory,
                );

                // Remove units no longer desired
                for (const [id, unit] of this.renderUnits) {
                    if (!desired.has(id)) {
                        this._removeRenderUnit(unit);
                    }
                }

                // Add new units
                for (const [id, unit] of desired) {
                    if (!this.renderUnits.has(id)) {
                        this._addRenderUnit(unit);
                    }
                }

                // Update existing units whose config or sourceUrl changed
                for (const [id, unit] of desired) {
                    const current = this.renderUnits.get(id);
                    if (
                        current &&
                        (this._configsDiffer(
                            current.descriptor.config,
                            unit.descriptor.config,
                        ) ||
                            current.descriptor.sourceUrl !==
                                unit.descriptor.sourceUrl)
                    ) {
                        this._updateExistingUnit(current, unit);
                    }
                }

                this._reorderMapNativeLayers();
            } catch (error) {
                logger.error("Failed to sync layers:", error);
            }
        });
    }

    // ==================== Render unit operations ====================

    private _addRenderUnit(unit: RenderUnit): void {
        if (!this.map || !this.isMapLoaded) return;

        try {
            unit.adapter.addToMap(unit.id, unit.descriptor, this.map);
            this.renderUnits.set(unit.id, unit);
        } catch (error) {
            logger.error(`Failed to add render unit "${unit.id}":`, error);
        }
    }

    private _removeRenderUnit(unit: RenderUnit): void {
        if (!this.map) return;

        try {
            unit.adapter.removeFromMap(unit.id, this.map);
            this.renderUnits.delete(unit.id);
        } catch (error) {
            logger.error(`Failed to remove render unit "${unit.id}":`, error);
        }
    }

    /**
     * Update an existing render unit.
     * Uses updateConfig for visual-only changes, full recreate for structural changes.
     */
    private _updateExistingUnit(
        current: RenderUnit,
        desired: RenderUnit,
    ): void {
        if (!this.map) {
            this._removeRenderUnit(current);
            this._addRenderUnit(desired);
            return;
        }

        desired.adapter.updateConfig(desired, this.map);
        this.renderUnits.set(desired.id, desired);
    }

    // ==================== Reordering ====================

    /**
     * Map nodeId → render unit id.
     * For single units this is identity; for future groups all nodeIds map to groupId.
     */
    private _getNodeToRenderIdMap(): Map<string, string> {
        const map = new Map<string, string>();
        for (const unit of this.renderUnits.values()) {
            for (const nodeId of unit.nodeIds) {
                map.set(nodeId, unit.id);
            }
        }
        return map;
    }

    /**
     * Reorder maplibre-native layers (RASTER and VECTOR) based on layer tree order.
     */
    private _reorderMapNativeLayers(): void {
        if (!this.map) return;

        try {
            const nodeToRenderId = this._getNodeToRenderIdMap();
            const snapshot = this.rootStore.treeStore.layerSnapshot;
            const renderOrder = getNativeRenderOrder(snapshot, nodeToRenderId);

            for (let i = 0; i < renderOrder.length; i++) {
                const layerId = renderOrder[i]!;
                const beforeId = i > 0 ? renderOrder[i - 1]! : undefined;

                if (beforeId !== undefined && this.map.getLayer(layerId)) {
                    this.map.moveLayer(layerId, beforeId);
                }
            }
        } catch (error) {
            logger.error("Failed to reorder layers:", error);
        }
    }

    // ==================== Utilities ====================

    private _configsDiffer(
        configA: LayerConfig,
        configB: LayerConfig,
    ): boolean {
        return !comparer.structural(configA, configB);
    }

    // ==================== Reactive setup ====================

    private setupReactiveSync(): void {
        if (!this.map) return;

        this.disposers.push(
            reaction(
                () => this.rootStore.treeStore.layerSnapshot,
                () => {
                    if (this.map && this.isInitialized && this.isMapLoaded) {
                        this.syncAllLayers();
                    }
                },
                {
                    name: "LayerSyncReaction",
                    fireImmediately: true,
                },
            ),
        );
    }

    private setupMapLoadListener(): void {
        if (!this.map) return;

        const onLoad = () => {
            runInAction(() => {
                this.isMapLoaded = true;
            });
            this.map?.off("load", onLoad);
            this.syncAllLayers();
        };

        if (this.map.loaded()) {
            runInAction(() => {
                this.isMapLoaded = true;
            });
            this.syncAllLayers();
        } else {
            this.map.on("load", onLoad);
            this.disposers.push(() => {
                this.map?.off("load", onLoad);
            });
        }
    }
}
