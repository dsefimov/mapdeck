import type { BindingSlot } from "@core/contracts";

/**
 * The STAC module's own per-slot fitness table: which node slots
 * each resolved protocol can serve, and how well — the core carries no
 * priority semantics, so flipping a protocol's role is an edit here, in the
 * module. An unknown protocol id has no entry and maps to a report row.
 */
export const PROTOCOL_SLOT_FITNESS: Readonly<
    Record<string, Partial<Record<BindingSlot, number>>>
> = {
    wms: { renderer: 100 },
    xyz: { renderer: 100 },
    copc: { renderer: 90 },
    "vector-tile": { renderer: 80 },
    "geojson-tiled": { renderer: 70 },
    wfs: { data: 100 },
    "ogc-features": { renderer: 70, data: 100 },
};

/** Fitness of one protocol for one slot; undefined = cannot serve it. */
export function slotFitness(
    protocolId: string,
    slot: BindingSlot,
): number | undefined {
    return PROTOCOL_SLOT_FITNESS[protocolId]?.[slot];
}
