import {
    type TreeNode,
    LayerTreeNodeTypes,
    type LayerNode,
    type GroupNode,
    isGroupNode,
} from "@core/contracts";
import type { STACCollection, STACItem, STACEntity } from "../types";
import { isSTACCollection } from "../types";
import { mapAssetsToProtocols, type ProtocolMappingResult } from "./RoleMapper";
import { assignCapabilities, type CapabilitySource } from "./capabilities";
import type { RoleResolverRegistry } from "../roles/RoleResolverRegistry";
import { bboxFromTuple, flattenTo2D, type Bbox } from "@core/lib/geo";
import { logger } from "@core/lib/logger";
import type { STACCache } from "../core/STACCache";


/**
 * Node bbox from a raw STAC bbox tuple; null when absent or degenerate —
 * the zoom control stays disabled for such nodes (GroupNode.bbox contract).
 */
function toNodeBbox(bbox: readonly number[] | undefined): Bbox | null {
    const parsed = bboxFromTuple(bbox);
    return parsed ? flattenTo2D(parsed) : null;
}

/** Maps STAC entities (collections, items) to tree nodes using protocol-based resolution. */
export class STACEntityMapper {
    constructor(
        private cache: STACCache,
        private roleRegistry: RoleResolverRegistry,
        private capabilitySource: CapabilitySource,
    ) {}

    /** Map a STAC collection to a GroupNode with child links. */
    mapCollectionToGroupNode(collection: STACCollection): GroupNode {
        const childLinkCount = collection.links.filter(
            (l) => l.rel === "child" || l.rel === "item",
        ).length;

        const reports = collection.assets
            ? (mapAssetsToProtocols(collection.assets, this.roleRegistry)
                  ?.relatedObjects ?? [])
            : [];

        return {
            id: collection.id,
            type: LayerTreeNodeTypes.Group,
            title: collection.title || collection.id,
            description: collection.description || "",
            metadata: { stacEntityRef: collection.id },
            parentId: null,
            childrenIds: [],
            childrenCount: childLinkCount,
            bbox: toNodeBbox(collection.extent?.spatial.bbox[0]),
            isVisible: false,
            relatedObjects: reports,
        };
    }

    /** Map a STAC item to a LayerNode via protocol resolution. Returns null when no renderer can be selected. */
    mapItemToLayerNode(item: STACItem): LayerNode | null {
        const result = mapAssetsToProtocols(item.assets, this.roleRegistry, {
                ...(item.properties
                    ? { properties: item.properties as Record<string, unknown> }
                    : {}),
                ...(item.bbox ? { itemBbox: item.bbox } : {}),
                ...(item.stac_extensions
                    ? { stac_extensions: item.stac_extensions }
                    : {}),
            },
        );
        if (!result || !result.renderer) return null;
        return this.buildLayerNode(item, {
            ...result,
            renderer: result.renderer,
        });
    }

    /** The caller has checked `renderer` is present (see mapItemToLayerNode). */
    private buildLayerNode(
        item: STACItem,
        result: ProtocolMappingResult & {
            renderer: NonNullable<ProtocolMappingResult["renderer"]>;
        },
    ): LayerNode {
        const { capabilities, unimplemented } = assignCapabilities(
            result.data
                ? { renderer: result.renderer, data: result.data }
                : { renderer: result.renderer },
            this.capabilitySource,
        );
        for (const capability of unimplemented) {
            logger.warn(
                `STAC: dropping unimplemented capability "${capability.toolId}" (${capability.slot}) on item "${item.id}"`,
            );
        }
        return {
            id: item.id,
            type: LayerTreeNodeTypes.Layer,
            title: item.properties.title || item.id,
            description: item.properties.description || "",
            metadata: { stacEntityRef: item.id },
            parentId: null,
            bbox: toNodeBbox(item.bbox),
            renderer: result.renderer,
            ...(result.data ? { data: result.data } : {}),
            capabilities,
            relatedObjects: result.relatedObjects,
            isVisible: false,
        };
    }

    /** Reverse-lookup: extract the STAC entity reference from a tree node's metadata. */
    getSTACEntityFromNode(node: TreeNode): STACEntity | null {
        const ref = node.metadata?.stacEntityRef as string | undefined;
        if (!ref) return null;
        // The cache is keyed by STAC entity type — derive it from the node kind.
        const type = isGroupNode(node) ? "Collection" : "Feature";
        return this.cache.get(type, ref) ?? null;
    }

    /** Reverse-lookup: extract a STAC collection from a tree node, if the node references one. */
    getSTACCollectionFromNode(node: TreeNode): STACCollection | null {
        const entity = this.getSTACEntityFromNode(node);
        return entity && isSTACCollection(entity) ? entity : null;
    }
}
