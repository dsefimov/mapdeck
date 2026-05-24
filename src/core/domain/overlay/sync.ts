import { LayerRoles } from "@core/framework/types";
import type { RenderUnit, SnapshotItem } from "@core/framework/types";
import type { LayerAdapterFactory } from "@core/domain/adapters";
import { applyWmsGrouping } from "@core/shared/protocols/ogc/wms/grouper";

/**
 * Build the desired set of render units from the current layer snapshot.
 * Each visible layer with a valid config becomes a single-node RenderUnit.
 */
export function buildDesiredRenderUnits(
    snapshot: SnapshotItem[],
    adapterFactory: LayerAdapterFactory,
): Map<string, RenderUnit> {
    const desired = new Map<string, RenderUnit>();

    for (const item of snapshot) {
        if (!item.visible || !item.descriptor) continue;

        const role = item.descriptor.role;
        if (!adapterFactory.has(role)) continue;

        desired.set(item.id, {
            id: item.id,
            nodeIds: [item.id],
            adapter: adapterFactory.get(role),
            descriptor: item.descriptor,
        });
    }

    return desired;
}

/**
 * Build grouped render units from the current layer snapshot.
 *
 * Starts with individual units via buildDesiredRenderUnits, then applies
 * grouping strategies. Each strategy removes individual units from the
 * result and replaces them with grouped units.
 *
 * To add a new grouping strategy:
 *   1. Create a pure grouping function (like groupVisibleWmsNodes)
 *   2. Add an applyXxxGrouping call below
 */
export function buildGroupedRenderUnits(
    snapshot: SnapshotItem[],
    adapterFactory: LayerAdapterFactory,
): Map<string, RenderUnit> {
    const result = buildDesiredRenderUnits(snapshot, adapterFactory);

    applyWmsGrouping(snapshot, adapterFactory, result);

    // Future: applyVectorTileGrouping(snapshot, adapterFactory, result);

    return result;
}

/**
 * Collect render unit ids in tree order for RASTER/VECTOR roles.
 */
export function getNativeRenderOrder(
    snapshot: SnapshotItem[],
    nodeToRenderId: Map<string, string>,
): string[] {
    const renderOrder: string[] = [];
    const seen = new Set<string>();

    for (const item of snapshot) {
        if (!item.visible || !item.descriptor) continue;
        const role = item.descriptor.role;
        if (role !== LayerRoles.RASTER && role !== LayerRoles.VECTOR) continue;

        const renderId = nodeToRenderId.get(item.id);
        if (renderId && !seen.has(renderId)) {
            seen.add(renderId);
            renderOrder.push(renderId);
        }
    }

    return renderOrder;
}
