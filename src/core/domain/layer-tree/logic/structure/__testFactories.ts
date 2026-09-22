import {
    type GroupNode,
    type LayerNode,
    LayerTreeNodeTypes,
    type ProtocolBinding,
    type LayerStyle,
    type TreeNode,
} from "@core/contracts";

/** Minimal valid ProtocolBinding for tests. */
export function protocolBinding(
    overrides?: Partial<ProtocolBinding>,
): ProtocolBinding {
    return {
        protocolId: "wms",
        sourceUrl: "https://example.com/wms",
        params: {},
        ...overrides,
    };
}

/** Minimal valid LayerStyle for tests. */
export function layerStyle(overrides?: Partial<LayerStyle>): LayerStyle {
    return { ...overrides };
}

/** Minimal valid LayerNode for tests. */
export function layerNode(
    id: string,
    overrides?: Partial<Omit<LayerNode, "id" | "type">>,
): LayerNode {
    return {
        id,
        type: LayerTreeNodeTypes.Layer,
        title: id,
        description: "",
        parentId: null,
        bbox: null,
        isVisible: true,
        renderer: protocolBinding(),
        capabilities: [],
        style: layerStyle(),
        relatedObjects: [],
        ...overrides,
    };
}

/** Minimal valid GroupNode for tests. */
export function groupNode(
    id: string,
    childrenIds: string[],
    overrides?: Partial<Omit<GroupNode, "id" | "type" | "childrenIds">>,
): GroupNode {
    return {
        id,
        type: LayerTreeNodeTypes.Group,
        title: id,
        description: "",
        parentId: null,
        bbox: null,
        isVisible: true,
        childrenIds,
        childrenCount: childrenIds.length,
        relatedObjects: [],
        ...overrides,
    } as GroupNode;
}

/** Minimal valid TreeNode (delegates to layerNode by default). */
export function treeNode(id: string, overrides?: Partial<TreeNode>): TreeNode {
    return layerNode(
        id,
        overrides as Partial<LayerNode>,
    ) as unknown as TreeNode;
}
