import { makeAutoObservable, observable } from "mobx";
import type { Bbox } from "@core/lib/geo";
import type { SelectionMode, SelectionRecord } from "./types";
import type { LayerSelection } from "./logic/selectionOps";
import {
    applySelection,
    toggleRecord,
    unionRecordExtents,
} from "./logic/selectionOps";

/** The stateStore key the one shared selection instance lives under. */
export const SELECTION_STATE_KEY = "feature-selection";

/**
 * Per-layer feature selection — the state shared by the selection map
 * tool, the attribute table and the on-map highlight. Records are
 * immutable data; a layer's inner map is replaced wholesale by every
 * operation, so shallow observability sees every change.
 */
export class SelectionStore {
    /** Layer node id → its selection; empty layers are absent. */
    readonly layers = new Map<string, LayerSelection>();

    private readonly _stableIds = new Map<string, boolean>();

    constructor() {
        makeAutoObservable<this, "_stableIds">(this, {
            _stableIds: false,
            layers: observable.shallow,
        });
    }

    /** Apply picked records to one layer under a mode. */
    applySelection(
        layerId: string,
        records: readonly SelectionRecord[],
        mode: SelectionMode,
    ): void {
        this.setLayer(layerId, applySelection(this.layers.get(layerId), records, mode));
    }

    /** Toggle one record in a layer's selection. */
    toggleRecord(layerId: string, record: SelectionRecord): void {
        this.setLayer(layerId, toggleRecord(this.layers.get(layerId), record));
    }

    clearLayer(layerId: string): void {
        this.layers.delete(layerId);
    }

    clearAll(): void {
        this.layers.clear();
    }

    /**
     * Whether a layer's features carry an id-like field. Set by whoever
     * sees the features (the tool on picks, the table on load) — it tells
     * the panel whether selection syncs across the two surfaces.
     */
    markStableIds(layerId: string, stable: boolean): void {
        this._stableIds.set(layerId, stable);
    }

    hasStableIds(layerId: string): boolean {
        return this._stableIds.get(layerId) ?? false;
    }

    hasKey(layerId: string, key: string): boolean {
        return this.layers.get(layerId)?.has(key) ?? false;
    }

    keysFor(layerId: string): ReadonlySet<string> {
        const selection = this.layers.get(layerId);
        return selection ? new Set(selection.keys()) : new Set<string>();
    }

    countFor(layerId: string): number {
        return this.layers.get(layerId)?.size ?? 0;
    }

    /** Layers with a non-empty selection, in insertion order. */
    get layerCounts(): ReadonlyArray<{ layerId: string; count: number }> {
        return Array.from(this.layers, ([layerId, selection]) => ({
            layerId,
            count: selection.size,
        }));
    }

    get isEmpty(): boolean {
        return this.layers.size === 0;
    }

    /** Combined extent of a layer's selection — the zoom-to-selection input. */
    layerExtent(layerId: string): Bbox | null {
        return unionRecordExtents(this.layers.get(layerId));
    }

    private setLayer(layerId: string, next: LayerSelection | null): void {
        if (next) {
            this.layers.set(layerId, next);
        } else {
            this.layers.delete(layerId);
        }
    }
}
