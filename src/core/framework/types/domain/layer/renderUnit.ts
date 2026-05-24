import type { LayerAdapter } from "./adapter";
import type { RenderDescriptor } from "./descriptor";
import type { LayerRole } from "./role";

/**
 * A render unit represents either a single layer or a group of layers
 * that are rendered as one unit on the map.
 *
 * - Single layer: nodeIds = [nodeId], id = nodeId
 * - WMS group: nodeIds = [nodeId1, nodeId2, ...], id = groupId
 */
export interface RenderUnit<TRole extends LayerRole = LayerRole> {
    id: string;
    nodeIds: string[];
    adapter: LayerAdapter;
    descriptor: RenderDescriptor<TRole>;
}

/**
 * Snapshot of a layer node for building render units.
 * Produced by LayerTreeStore.layerSnapshot.
 */
export interface SnapshotItem {
    id: string;
    visible: boolean;
    descriptor: RenderDescriptor | null;
}
