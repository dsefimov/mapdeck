import { structuralEquals } from "@core/lib/equality";
import type {
    ProtocolRegistry,
    RenderUnit,
    SnapshotItem,
} from "@core/contracts";

/** Visible layers with registered protocols → RenderUnit map. */
export function buildDesiredRenderUnits(
    snapshot: SnapshotItem[],
    protocols: ProtocolRegistry,
): Map<string, RenderUnit> {
    const desired = new Map<string, RenderUnit>();

    for (const item of snapshot) {
        if (!item.visible) continue;

        const protocol = protocols.getById(item.protocolId);
        if (!protocol) continue;

        desired.set(item.id, {
            id: item.id,
            nodeIds: [item.id],
            protocolId: item.protocolId,
            adapter: protocol.getLayerAdapter(),
            descriptor: item.descriptor,
        });
    }

    return desired;
}

/** Applies protocol grouping (e.g. WMS batching) on top of individual units. */
export function buildGroupedRenderUnits(
    snapshot: SnapshotItem[],
    protocols: ProtocolRegistry,
): Map<string, RenderUnit> {
    const result = buildDesiredRenderUnits(snapshot, protocols);

    for (const protocol of protocols.getAll()) {
        protocol.groupRenderUnits?.(result);
    }

    return result;
}

/** Tree-order render-unit ids for adapters with native MapLibre z-ordering. */
export function getNativeRenderOrder(
    snapshot: SnapshotItem[],
    nodeToRenderId: Map<string, string>,
    renderUnits: Map<string, RenderUnit>,
): string[] {
    const renderOrder: string[] = [];
    const seen = new Set<string>();

    for (const item of snapshot) {
        if (!item.visible) continue;

        const renderId = nodeToRenderId.get(item.id);
        if (!renderId || seen.has(renderId)) continue;

        const unit = renderUnits.get(renderId);
        if (unit?.adapter.nativeLayerOrdering) {
            seen.add(renderId);
            renderOrder.push(renderId);
        }
    }

    return renderOrder;
}

/** Diff result of currently registered vs. desired render units. */
export interface RenderUnitChanges {
    added: RenderUnit[];
    removed: RenderUnit[];
    shown: RenderUnit[];
    hidden: RenderUnit[];
    updated: RenderUnit[];
}

/** True when a retained unit's descriptor differs from the desired one. */
export function descriptorsDiffer(
    current: RenderUnit,
    desired: RenderUnit,
): boolean {
    return (
        current.descriptor.sourceUrl !== desired.descriptor.sourceUrl ||
        !structuralEquals(
            current.descriptor.config,
            desired.descriptor.config,
        )
    );
}

/** True when every node of the unit is still in the snapshot and invisible. */
function isUnitHiddenCandidate(
    unit: RenderUnit,
    snapshotById: Map<string, SnapshotItem>,
): boolean {
    return unit.nodeIds.every((nodeId) => {
        const item = snapshotById.get(nodeId);
        return item !== undefined && !item.visible;
    });
}

/**
 * Classifies the diff between the registered render units and the desired set
 * built from the snapshot, separating visibility-only changes from structural
 * ones so hidden units are retained in place (ADR-0010).
 *
 * - in `desired` only → `added` (invisible items never reach `desired`);
 * - in `current` only, every node id still present in the snapshot and
 *   invisible → `hidden` (unit retained, `updateVisibility(false)`);
 * - in `current` only otherwise (node removed / WMS regroup) → `removed`;
 * - in both, tracked visibility `false` → `shown` (`updateVisibility(true)`,
 *   no re-add), plus `updated` when the retained descriptor differs;
 * - in both, tracked visibility `true`, descriptor changed → `updated`.
 */
export function classifyRenderUnitChanges(
    current: Map<string, RenderUnit>,
    desired: Map<string, RenderUnit>,
    snapshot: SnapshotItem[],
    unitVisibility: Map<string, boolean>,
): RenderUnitChanges {
    const changes: RenderUnitChanges = {
        added: [],
        removed: [],
        shown: [],
        hidden: [],
        updated: [],
    };
    const snapshotById = new Map(snapshot.map((item) => [item.id, item]));

    classifySharedUnits(current, desired, unitVisibility, changes);

    const retained = classifyRetainedUnits(
        current,
        desired,
        snapshotById,
        unitVisibility,
    );
    changes.removed.push(...retained.removed);
    changes.hidden.push(...retained.hidden);

    return changes;
}

function classifySharedUnits(
    current: Map<string, RenderUnit>,
    desired: Map<string, RenderUnit>,
    unitVisibility: Map<string, boolean>,
    changes: RenderUnitChanges,
): void {
    for (const [id, desiredUnit] of desired) {
        const currentUnit = current.get(id);
        if (!currentUnit) {
            changes.added.push(desiredUnit);
            continue;
        }

        const wasVisible = unitVisibility.get(id) ?? true;
        if (!wasVisible) changes.shown.push(desiredUnit);
        if (descriptorsDiffer(currentUnit, desiredUnit)) {
            changes.updated.push(desiredUnit);
        }
    }
}

function classifyRetainedUnits(
    current: Map<string, RenderUnit>,
    desired: Map<string, RenderUnit>,
    snapshotById: Map<string, SnapshotItem>,
    unitVisibility: Map<string, boolean>,
): { removed: RenderUnit[]; hidden: RenderUnit[] } {
    const removed: RenderUnit[] = [];
    const hidden: RenderUnit[] = [];

    for (const [id, currentUnit] of current) {
        if (desired.has(id)) continue;

        if (isUnitHiddenCandidate(currentUnit, snapshotById)) {
            // Hide on the visible→hidden transition; an already-hidden unit
            // stays untouched.
            if (unitVisibility.get(id) !== false) hidden.push(currentUnit);
        } else {
            removed.push(currentUnit);
        }
    }

    return { removed, hidden };
}
