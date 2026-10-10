import { type Bbox } from "@core/lib/geo";
import type {
    ProtocolBinding,
    LayerStyle,
    Legend,
    RelatedObject,
} from "./protocol";

export enum LayerTreeNodeTypes {
    Group = "GROUP",
    Layer = "LAYER",
}

/**
 * Which of a layer node's two protocol bindings serves a capability or an
 * assignment: map rendering (`renderer`) or attribute access (`data`).
 * Shared by the node model, the tool links and source modules.
 */
export type BindingSlot = "renderer" | "data";

/**
 * A capability assigned to a node by its source: the id of a
 * layer tool plus the binding slot that serves it. Open string vocabulary —
 * modules register their own tools.
 */
export interface NodeCapability {
    readonly toolId: string;
    readonly slot: BindingSlot;
}

/** Fields shared by every tree node. */
export interface TreeNodeBase {
    id: string;
    type: LayerTreeNodeTypes;

    title: string;
    description: string;

    metadata?: Record<string, unknown>;

    parentId: string | null;

    // Single extent attribute for zoom functionality.
    // null when the node has no spatial extent (zoom button disabled).
    bbox: Bbox | null;

    isVisible: boolean;

    /** Related resources (collections, reports, datasets, etc.). */
    relatedObjects: RelatedObject[];
}

/** A tree node that groups child nodes. */
export interface GroupNode extends TreeNodeBase {
    type: LayerTreeNodeTypes.Group;

    /** Only GroupNode populates this. Plain data — the store owns observability. */
    childrenIds: readonly string[];

    /** Known or estimated number of children (0 if unknown). */
    childrenCount: number;
}

/** A leaf tree node with protocol bindings for rendering and data. */
export interface LayerNode extends TreeNodeBase {
    type: LayerTreeNodeTypes.Layer;

    renderer: ProtocolBinding;

    data?: ProtocolBinding;

    /**
     * Capabilities the source assigned to this node — verified at assignment
     * (a capability survives only when its tool link exists). The
     * menu resolves these to tools in list order; capabilities play no part
     * in rendering.
     */
    capabilities: readonly NodeCapability[];

    /** Visual style in Mapbox GL format — protocol-agnostic.
     * Absent when the source assigns no style; the protocol's `defaultStyle`
     * applies then. */
    style?: LayerStyle;

    legend?: Legend;
}

/** Union of all tree node kinds. */
export type TreeNode = GroupNode | LayerNode;

/**
 * Read access to the layer catalog — the runtime-slice port tool panels and
 * modules consume. Extensions never touch the tree store itself.
 */
export interface LayerCatalogPort {
    /** Every layer node currently in the tree, in tree order. */
    readonly allLayerNodes: readonly LayerNode[];
}

/** Whether the node is a group node. */
export function isGroupNode(node: TreeNode): node is GroupNode {
    return node.type === LayerTreeNodeTypes.Group;
}

/** Whether the node is a layer node. */
export function isLayerNode(node: TreeNode): node is LayerNode {
    return node.type === LayerTreeNodeTypes.Layer;
}
