import { comparer, reaction } from "mobx";

import { logger } from "@core/shared/diagnostics/logger";
import type {
    LayerConfig,
    MapContext,
    RenderUnit,
} from "@core/framework/types";
import type { RootStore } from "@core/framework/store";
import {
    buildGroupedRenderUnits,
    getNativeRenderOrder,
} from "@core/domain/managers/layerSync";

/**
 * Modern adapter-based Layer Manager
 *
 * Uses NodeRole system: gets active display role from node,
 * delegates operations to appropriate adapters by layer role.
 */
export class LayerManager {
    private rootStore: RootStore;
    private mapContext: MapContext;
    private disposers: (() => void)[] = [];
    private isInitialized = false;
    private isMapLoaded = false;

    /**
     * Unified registry of render units on the map.
     * Key = nodeId (single) or groupId (future WMS groups).
     */
    private renderUnits = new Map<string, RenderUnit>();

    constructor(rootStore: RootStore, mapContext: MapContext) {
        this.rootStore = rootStore;
        this.mapContext = mapContext;
    }

    // ==================== Lifecycle ====================

    initialize(): void {
        if (this.isInitialized) {
            logger.warn("LayerManager already initialized");
            return;
        }

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

        this.isInitialized = false;
        this.renderUnits.clear();
    }

    // ==================== Diff-based sync ====================

    /**
     * Sync all layers with current layer tree state using diff logic.
     * Layer grouping is handled by buildGroupedRenderUnits.
     */
    private syncAllLayers(): void {
        if (!this.isInitialized || !this.isMapLoaded) return;

        try {
            const snapshot = this.rootStore.treeStore.layerSnapshot;
            const desired = buildGroupedRenderUnits(
                snapshot,
                this.rootStore.layerAdapterFactory,
            );

            this._removeStaleUnits(desired);
            this._addNewUnits(desired);
            this._updateChangedUnits(desired);
            this._reorderMapNativeLayers();
        } catch (error) {
            logger.error("Failed to sync layers:", error);
        }
    }

    private _removeStaleUnits(desired: Map<string, RenderUnit>): void {
        for (const [id, unit] of this.renderUnits) {
            if (!desired.has(id)) {
                this._removeRenderUnit(unit);
            }
        }
    }

    private _addNewUnits(desired: Map<string, RenderUnit>): void {
        for (const [id, unit] of desired) {
            if (!this.renderUnits.has(id)) {
                this._addRenderUnit(unit);
            }
        }
    }

    private _updateChangedUnits(desired: Map<string, RenderUnit>): void {
        for (const [id, unit] of desired) {
            const current = this.renderUnits.get(id);
            if (
                current &&
                (this._configsDiffer(
                    current.descriptor.config,
                    unit.descriptor.config,
                ) ||
                    current.descriptor.sourceUrl !== unit.descriptor.sourceUrl)
            ) {
                this._updateExistingUnit(current, unit);
            }
        }
    }

    // ==================== Render unit operations ====================

    private _addRenderUnit(unit: RenderUnit): void {
        if (!this.isMapLoaded) return;

        try {
            unit.adapter.addToMap(unit.id, unit.descriptor, this.mapContext);
            this.renderUnits.set(unit.id, unit);
        } catch (error) {
            logger.error(`Failed to add render unit "${unit.id}":`, error);
        }
    }

    private _removeRenderUnit(unit: RenderUnit): void {
        try {
            unit.adapter.removeFromMap(unit.id, this.mapContext);
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
        _current: RenderUnit,
        desired: RenderUnit,
    ): void {
        desired.adapter.updateConfig(desired, this.mapContext);
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
        try {
            const nodeToRenderId = this._getNodeToRenderIdMap();
            const snapshot = this.rootStore.treeStore.layerSnapshot;
            const renderOrder = getNativeRenderOrder(snapshot, nodeToRenderId);

            for (let i = 0; i < renderOrder.length; i++) {
                const layerId = renderOrder[i]!;
                const beforeId = i > 0 ? renderOrder[i - 1]! : undefined;

                if (
                    beforeId !== undefined &&
                    this.mapContext.map.getLayer(layerId)
                ) {
                    this.mapContext.map.moveLayer(layerId, beforeId);
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
        this.disposers.push(
            reaction(
                () => this.rootStore.treeStore.layerSnapshot,
                () => {
                    if (this.isInitialized && this.isMapLoaded) {
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
        const onLoad = () => {
            this.isMapLoaded = true;
            this.mapContext.map.off("load", onLoad);
            this.syncAllLayers();
        };

        if (this.mapContext.map.loaded()) {
            this.isMapLoaded = true;
            this.syncAllLayers();
        } else {
            this.mapContext.map.on("load", onLoad);
            this.disposers.push(() => {
                this.mapContext.map.off("load", onLoad);
            });
        }
    }
}
