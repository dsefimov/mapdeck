import { reaction } from "mobx";

import { logger } from "@core/lib/logger";
import type {
    MapContext,
    RenderUnit,
    SnapshotItem,
    LayerSnapshotSource,
    RenderErrorSink,
    ProtocolRegistry,
} from "@core/contracts";
import {
    buildGroupedRenderUnits,
    classifyRenderUnitChanges,
    descriptorsDiffer,
    getNativeRenderOrder,
} from "../logic/layerSync";

/** A failed render unit awaiting a gated retry. */
interface FailedUnitRecord {
    unit: RenderUnit;
    /** Last-seen visibility of the unit's nodes, refreshed from the snapshot. */
    visible: boolean;
}

/**
 * The declared cross-domain edge into the layer tree (ADR-0002): the manager
 * consumes the snapshot, reports render errors, and resolves protocols
 * through contracts ports — never through the concrete stores.
 */
export interface LayerManagerDeps {
    readonly snapshot: LayerSnapshotSource;
    readonly errors: RenderErrorSink;
    readonly protocols: ProtocolRegistry;
}

/**
 * Adapter-based Layer Manager: delegates operations to the appropriate
 * adapter per protocol via ProtocolRegistry and its
 * Protocol.getLayerAdapter() method.
 */
export class LayerManager {
    private readonly deps: LayerManagerDeps;
    private readonly mapContext: MapContext;
    private disposers: (() => void)[] = [];
    private isInitialized = false;
    private isMapLoaded = false;

    /**
     * Unified registry of render units on the map.
     * Key = nodeId (single) or groupId (WMS groups).
     */
    private renderUnits = new Map<string, RenderUnit>();

    /** Last known visibility per render unit (true on add, updated on show/hide). */
    private _unitVisibility = new Map<string, boolean>();

    /** Failed units awaiting a gated retry: id → last descriptor + node visibility. */
    private _failedUnits = new Map<string, FailedUnitRecord>();

    constructor(deps: LayerManagerDeps, mapContext: MapContext) {
        this.deps = deps;
        this.mapContext = mapContext;
    }

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
        this._unitVisibility.clear();
        this._failedUnits.clear();
    }

    /**
     * Sync all layers with current layer tree state using diff logic.
     * Layer grouping is handled by buildGroupedRenderUnits.
     */
    private syncAllLayers(): void {
        if (!this.isInitialized || !this.isMapLoaded) return;

        try {
            const snapshot = this.deps.snapshot.layerSnapshot;
            const desired = buildGroupedRenderUnits(
                snapshot,
                this.deps.protocols,
            );

            const changes = classifyRenderUnitChanges(
                this.renderUnits,
                desired,
                snapshot,
                this._unitVisibility,
            );

            for (const unit of changes.removed) this._removeRenderUnit(unit);
            for (const unit of changes.added) {
                if (this._shouldRetryFailedUnit(unit)) {
                    this._addRenderUnit(unit);
                }
            }
            for (const unit of changes.shown) this._showRenderUnit(unit);
            for (const unit of changes.updated) this._updateExistingUnit(unit);
            for (const unit of changes.hidden) this._hideRenderUnit(unit);

            this._refreshFailedUnits(snapshot);
            this._reorderMapNativeLayers();
        } catch (error) {
            logger.error("Failed to sync layers:", error);
        }
    }

    /**
     * Reconciles a reported async layer-lifecycle failure: logs, unregisters
     * the render unit, records it for a gated retry, and surfaces the
     * per-node error in the tree.
     */
    handleLayerError(layerId: string, error: unknown): void {
        logger.error(`Failed to render unit "${layerId}":`, error);

        const unit = this.renderUnits.get(layerId);
        if (!unit) return;

        this.renderUnits.delete(layerId);
        this._unitVisibility.delete(layerId);
        this._failedUnits.set(layerId, { unit, visible: true });
        this.deps.errors.reportRenderError(
            unit.nodeIds,
            error instanceof Error ? error.message : String(error),
        );
    }

    /**
     * Retry gate: a failed unit is re-added only when the node's user state
     * changed — visibility transitioned or the descriptor differs.
     */
    private _shouldRetryFailedUnit(unit: RenderUnit): boolean {
        const record = this._failedUnits.get(unit.id);
        if (!record) return true;

        const retry = !record.visible || descriptorsDiffer(record.unit, unit);
        if (retry) this._failedUnits.delete(unit.id);
        return retry;
    }

    /**
     * Tracks failed units' node visibility from the snapshot and drops
     * records (and their per-node errors) for units whose nodes left the tree.
     */
    private _refreshFailedUnits(snapshot: SnapshotItem[]): void {
        const snapshotById = new Map(snapshot.map((item) => [item.id, item]));

        for (const [id, record] of this._failedUnits) {
            const nodeItems = record.unit.nodeIds
                .map((nodeId) => snapshotById.get(nodeId))
                .filter((item): item is SnapshotItem => item !== undefined);

            if (nodeItems.length === 0) {
                this._failedUnits.delete(id);
                this.deps.errors.reportRenderError(
                    record.unit.nodeIds,
                    null,
                );
                continue;
            }

            record.visible = nodeItems.every((item) => item.visible);
        }
    }

    private _addRenderUnit(unit: RenderUnit): void {
        if (!this.isMapLoaded) return;

        try {
            unit.adapter.addToMap(unit.id, unit.descriptor, this.mapContext);
            this.renderUnits.set(unit.id, unit);
            this._unitVisibility.set(unit.id, true);
            this.deps.errors.reportRenderError(unit.nodeIds, null);
        } catch (error) {
            logger.error(`Failed to add render unit "${unit.id}":`, error);
            this._failedUnits.set(unit.id, { unit, visible: true });
            this._reportError(unit, error);
        }
    }

    /** The tree learns what the map already knows — every unit failure reaches it. */
    private _reportError(
        unit: RenderUnit,
        error: unknown,
    ): void {
        this.deps.errors.reportRenderError(
            unit.nodeIds,
            error instanceof Error ? error.message : String(error),
        );
    }

    private _removeRenderUnit(unit: RenderUnit): void {
        try {
            unit.adapter.removeFromMap(unit.id, this.mapContext);
            this.renderUnits.delete(unit.id);
            this._unitVisibility.delete(unit.id);
            this.deps.errors.reportRenderError(unit.nodeIds, null);
        } catch (error) {
            logger.error(`Failed to remove render unit "${unit.id}":`, error);
            this._reportError(unit, error);
        }
    }

    private _showRenderUnit(unit: RenderUnit): void {
        try {
            unit.adapter.updateVisibility(unit.id, true, this.mapContext);
            this.renderUnits.set(unit.id, unit);
            this._unitVisibility.set(unit.id, true);
            this.deps.errors.reportRenderError(unit.nodeIds, null);
        } catch (error) {
            logger.error(`Failed to show render unit "${unit.id}":`, error);
            this._reportError(unit, error);
        }
    }

    private _hideRenderUnit(unit: RenderUnit): void {
        try {
            unit.adapter.updateVisibility(unit.id, false, this.mapContext);
            this._unitVisibility.set(unit.id, false);
            this.deps.errors.reportRenderError(unit.nodeIds, null);
        } catch (error) {
            logger.error(`Failed to hide render unit "${unit.id}":`, error);
            this._reportError(unit, error);
        }
    }

    /**
     * Update an existing render unit.
     * Uses updateConfig for visual-only changes, full recreate for structural changes.
     */
    private _updateExistingUnit(unit: RenderUnit): void {
        try {
            unit.adapter.updateConfig(unit, this.mapContext);
            this.renderUnits.set(unit.id, unit);
            this.deps.errors.reportRenderError(unit.nodeIds, null);
        } catch (error) {
            logger.error(`Failed to update render unit "${unit.id}":`, error);
            this._reportError(unit, error);
        }
    }

    /**
     * Map nodeId → render unit id.
     * For single units this is identity; for groups all nodeIds map to groupId.
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
     * Reorder maplibre-native layers based on adapter.nativeLayerOrdering
     * and layer tree order.
     */
    private _reorderMapNativeLayers(): void {
        try {
            const nodeToRenderId = this._getNodeToRenderIdMap();
            const snapshot = this.deps.snapshot.layerSnapshot;
            const renderOrder = getNativeRenderOrder(
                snapshot,
                nodeToRenderId,
                this.renderUnits,
            );

            for (let i = 0; i < renderOrder.length; i++) {
                const layerId = renderOrder[i]!;
                const beforeId = i > 0 ? renderOrder[i - 1]! : undefined;

                // Both ends must exist: maplibre throws for a missing
                // neighbor, and that throw would abort the remaining moves.
                if (
                    beforeId !== undefined &&
                    this.mapContext.map.getLayer(layerId) &&
                    this.mapContext.map.getLayer(beforeId)
                ) {
                    this.mapContext.map.moveLayer(layerId, beforeId);
                }
            }
        } catch (error) {
            logger.error("Failed to reorder layers:", error);
        }
    }

    private setupReactiveSync(): void {
        this.disposers.push(
            reaction(
                () => this.deps.snapshot.layerSnapshot,
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
