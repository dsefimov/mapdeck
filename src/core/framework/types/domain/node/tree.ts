/**
 * Tree node types and interfaces for layer tree structure.
 *
 * Nodes carry structured roles (NodeRoles) for capabilities.
 * Core does NOT know about STAC — STAC module maps into NodeRoles.
 */
import { type NodeRoles, type LayerNodeRoles } from "./role";
import { type Bbox } from "@core/framework/types/geo";
import { type IObservableArray } from "mobx";

export enum LayerTreeNodeTypes {
    Group = "GROUP",
    Layer = "LAYER",
}

export interface TreeNodeBase {
    id: string;
    type: LayerTreeNodeTypes;

    title: string;
    description: string;
    icon: string;

    metadata?: Record<string, unknown>;

    // ID-based navigation
    parentId: string | null;

    // Single extent attribute for zoom functionality.
    // null when the node has no spatial extent (zoom button disabled).
    bbox: Bbox | null;

    /**
     * Structured roles: display, attribute, reports.
     *
     * display is optional for GroupNode, required for LayerNode (via LayerNodeRoles override).
     */
    roles: NodeRoles;

    /** Visibility toggle shared by all node types. */
    isVisible: boolean;
}

export interface GroupNode extends TreeNodeBase {
    type: LayerTreeNodeTypes.Group;

    /** Children node IDs. Only group nodes can have children. */
    childrenIds: IObservableArray<string>;

    /** Known or estimated number of children (0 if unknown). */
    childrenCount: number;

    isExtended: boolean;
}

export interface LayerNode extends TreeNodeBase {
    type: LayerTreeNodeTypes.Layer;

    /** LayerNode has at most one display role. */
    roles: LayerNodeRoles;
}

export type TreeNode = GroupNode | LayerNode;

export function isGroupNode(node: TreeNode): node is GroupNode {
    return node.type === LayerTreeNodeTypes.Group;
}

export function isLayerNode(node: TreeNode): node is LayerNode {
    return node.type === LayerTreeNodeTypes.Layer;
}
