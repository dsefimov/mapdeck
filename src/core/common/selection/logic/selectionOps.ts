import { unionBbox, type Bbox } from "@core/lib/geo";
import type { SelectionMode, SelectionRecord } from "../types";
import { isStableKey } from "./featureKey";

/**
 * One layer's selection: feature key → record. Treated as immutable —
 * every operation returns a new map (or null when the selection became
 * empty), so the store can hold inner maps outside deep observability.
 */
export type LayerSelection = ReadonlyMap<string, SelectionRecord>;

/** Record the union prefers: an existing footprint survives a bare key. */
function richerRecord(
    existing: SelectionRecord | undefined,
    incoming: SelectionRecord,
): SelectionRecord {
    if (existing?.footprint && !incoming.footprint) return existing;
    return incoming;
}

/**
 * Combine picked records with a layer's selection under a mode. Returns
 * null when the result is empty — the caller drops the layer entry.
 */
export function applySelection(
    existing: LayerSelection | null | undefined,
    records: readonly SelectionRecord[],
    mode: SelectionMode,
): LayerSelection | null {
    if (mode === "new") {
        return records.length > 0
            ? new Map(records.map((record) => [record.key, record]))
            : null;
    }

    if (mode === "remove") {
        if (!existing) return null;
        const next = new Map(existing);
        for (const record of records) next.delete(record.key);
        return next.size > 0 ? next : null;
    }

    const next = new Map(existing ?? []);
    for (const record of records) {
        next.set(record.key, richerRecord(next.get(record.key), record));
    }
    return next.size > 0 ? next : null;
}

/** Toggle one record; returns null when the layer's selection becomes empty. */
export function toggleRecord(
    existing: LayerSelection | null | undefined,
    record: SelectionRecord,
): LayerSelection | null {
    if (existing?.has(record.key)) {
        const next = new Map(existing);
        next.delete(record.key);
        return next.size > 0 ? next : null;
    }
    return new Map(existing ?? []).set(record.key, record);
}

/** Union of every record's footprint bbox — the layer selection's extent. */
export function unionRecordExtents(
    selection: LayerSelection | null | undefined,
): Bbox | null {
    let union: Bbox | null = null;
    for (const record of selection?.values() ?? []) {
        union = unionBbox(union, record.footprint?.bbox ?? null);
    }
    return union;
}

/**
 * Drop the surface-local (index-keyed) records, keeping the stable ones
 * — a refetch or re-sort may silently re-target index keys, so they
 * cannot survive new data; stable keys match by value. Returns the same
 * reference when nothing is removed, so callers keep their identity.
 */
export function retainStableKeys(selection: LayerSelection): LayerSelection {
    let removed = false;
    for (const key of selection.keys()) {
        if (!isStableKey(key)) {
            removed = true;
            break;
        }
    }
    if (!removed) return selection;
    const next = new Map<string, SelectionRecord>();
    for (const [key, record] of selection) {
        if (isStableKey(key)) next.set(key, record);
    }
    return next;
}
