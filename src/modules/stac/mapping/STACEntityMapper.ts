import type { IObservableArray } from "mobx";
import { logger } from "@core/shared/diagnostics/logger";
import {
    type TreeNode,
    LayerTreeNodeTypes,
    type LayerNode,
    type GroupNode,
    type NodeRoles,
    type LayerNodeRoles,
} from "@core/framework/types";
import type { STACCollection, STACItem, STACEntity } from "../types";
import { isSTACCollection } from "../types";
import { mapAssetsToNodeRoles } from "./RoleMapper";
import type { LayerConfigRegistry } from "@core/domain/adapters";
import type { RoleResolverRegistry } from "../roles/RoleResolverRegistry";
import { Bbox, flattenTo2D } from "@core/shared/geo";
import type { STACCache } from "../core/STACCache";

export class STACEntityMapper {
    constructor(
        private cache: STACCache,
        private layerConfigRegistry: LayerConfigRegistry,
        private roleRegistry: RoleResolverRegistry,
    ) {}

    mapCollectionToGroupNode(
        collection: STACCollection,
        childrenIds: IObservableArray<string>,
    ): TreeNode {
        const flattenedBbox = flattenTo2D(
            new Bbox(collection.extent.spatial.bbox[0]!),
        );

        const roles: NodeRoles = collection.assets
            ? mapAssetsToNodeRoles(
                  collection.assets,
                  this.roleRegistry,
                  this.layerConfigRegistry,
              )
            : { reports: [] };

        // Estimate the number of direct children.
        // Count directly linked children (static STAC).
        // 0 means unknown — the component will decide how to handle it.
        const childLinkCount = collection.links.filter(
            (l) => l.rel === "child" || l.rel === "item",
        ).length;

        return {
            id: collection.id,
            type: LayerTreeNodeTypes.Group,
            title: collection.title || collection.id,
            description: collection.description || "",
            icon: "",
            metadata: {
                stacEntityRef: `Collection:${collection.id}`,
            },
            parentId: null,
            childrenIds,
            childrenCount: childLinkCount,
            bbox: flattenedBbox,
            roles,
            isExtended: false,
            isVisible: false,
        } as GroupNode;
    }

    mapItemToLayerNode(item: STACItem): TreeNode | null {
        const roles = mapAssetsToNodeRoles(
            item.assets,
            this.roleRegistry,
            this.layerConfigRegistry,
            item.properties,
            item.bbox,
        );

        const hasBbox = item.bbox && item.bbox.length >= 4;

        if (roles.reports.length === 0 && !roles.display && !roles.attribute) {
            return this.createPlaceholderOrSkip(item, hasBbox, "no assets");
        }

        const layerRoles = this.resolveRoleConflicts(roles);
        if (!layerRoles) {
            return this.createPlaceholderOrSkip(item, hasBbox, "no display");
        }

        const flattenedBbox = hasBbox ? flattenTo2D(new Bbox(item.bbox)) : null;

        const layerNode: LayerNode = {
            id: item.id,
            type: LayerTreeNodeTypes.Layer,
            title: item.properties.title || item.id,
            description: item.properties.description || "",
            icon: "",
            metadata: {
                stacEntityRef: `Feature:${item.id}`,
            },
            parentId: null,
            bbox: flattenedBbox,
            roles: layerRoles,
            isVisible: false,
        };

        return layerNode;
    }

    getSTACEntityFromNode(node: TreeNode): STACEntity | null {
        const ref = node.metadata?.stacEntityRef as string | undefined;
        if (!ref) return null;

        const colonIndex = ref.indexOf(":");
        if (colonIndex === -1) return null;

        const type = ref.slice(0, colonIndex);
        const id = ref.slice(colonIndex + 1);
        return this.cache.get<STACEntity>(type, id) ?? null;
    }

    getSTACCollectionFromNode(node: TreeNode): STACCollection | null {
        const entity = this.getSTACEntityFromNode(node);
        if (entity && isSTACCollection(entity)) {
            return entity;
        }
        return null;
    }

    /**
     * Resolve role conflicts by keeping only one display role and one attribute role.
     * Report roles are kept as-is (multiple reports are allowed).
     *
     * Returns null if no display role is present (item cannot be a layer).
     */
    private resolveRoleConflicts(roles: NodeRoles): LayerNodeRoles | null {
        if (!roles.display) return null;

        const result: LayerNodeRoles = {
            display: roles.display,
            reports: roles.reports,
        };
        if (roles.attribute) result.attribute = roles.attribute;
        return result;
    }

    /**
     * Create a placeholder layer node for items that have spatial extent
     * but no renderable assets. The node has no display role — it appears
     * in the tree with the item title and bbox, but no map rendering or
     * action buttons.
     */
    private createPlaceholderOrSkip(
        item: STACItem,
        hasBbox: boolean,
        reason: string,
    ): TreeNode | null {
        if (!hasBbox) {
            logger.debug(`Item ${item.id} has no bbox and ${reason}, skipping`);
            return null;
        }
        const flattenedBbox =
            item.bbox && item.bbox.length >= 4
                ? flattenTo2D(new Bbox(item.bbox))
                : null;

        const layerNode: LayerNode = {
            id: item.id,
            type: LayerTreeNodeTypes.Layer,
            title: item.properties.title || item.id,
            description: item.properties.description || "",
            icon: "",
            metadata: {
                stacEntityRef: `Feature:${item.id}`,
            },
            parentId: null,
            bbox: flattenedBbox,
            roles: { reports: [] },
            isVisible: false,
        };

        return layerNode;
    }
}
