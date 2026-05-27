import type { IObservableArray } from "mobx";
import { logger } from "@core/shared/diagnostics/logger";
import {
    type TreeNode,
    LayerTreeNodeTypes,
    type LayerNode,
    type GroupNode,
    type NodeRoles,
    type LayerNodeRoles,
    type PointCloudLayerConfig,
} from "@core/framework/types";
import type { STACCollection, STACItem, STACEntity } from "../types";
import { isSTACCollection } from "../types";
import { mapAssetsToNodeRoles } from "./RoleMapper";
import type { LayerConfigRegistry } from "@core/domain/adapters";
import { Bbox, flattenTo2D } from "@core/shared/geo";
import type { STACCache } from "../core/STACCache";

export class STACEntityMapper {
    constructor(
        private cache: STACCache,
        private layerConfigRegistry: LayerConfigRegistry,
    ) {}

    mapCollectionToGroupNode(
        collection: STACCollection,
        childrenIds: IObservableArray<string>,
    ): TreeNode {
        const flattenedBbox = flattenTo2D(
            new Bbox(collection.extent.spatial.bbox[0]!),
        );

        const roles: NodeRoles = collection.assets
            ? mapAssetsToNodeRoles(collection.assets, this.layerConfigRegistry)
            : { reports: [] };

        return {
            id: collection.id,
            type: LayerTreeNodeTypes.Group,
            title: collection.title || collection.id,
            description: collection.description || "",
            icon: "",
            metadata: {
                stacEntityRef: `Collection:${collection.id}`,
                stacEntity: JSON.stringify(collection),
            },
            parentId: null,
            childrenIds,
            bbox: flattenedBbox,
            roles,
            isExtended: false,
            isVisible: false,
        } as GroupNode;
    }

    mapItemToLayerNode(item: STACItem): TreeNode | null {
        const roles = mapAssetsToNodeRoles(
            item.assets,
            this.layerConfigRegistry,
            item.properties,
        );

        if (roles.reports.length === 0 && !roles.display && !roles.attribute) {
            logger.warn(`Item ${item.id} has no recognized assets, skipping`);
            return null;
        }

        const layerRoles = this.resolveRoleConflicts(roles);
        if (!layerRoles) {
            logger.warn(
                `Item ${item.id} has no display roles, skipping as layer`,
            );
            return null;
        }

        this.augmentPointCloudRoles(layerRoles, item);

        const flattenedBbox = flattenTo2D(new Bbox(item.bbox));

        const layerNode: LayerNode = {
            id: item.id,
            type: LayerTreeNodeTypes.Layer,
            title: item.properties.title || item.id,
            description: item.properties.description || "",
            icon: "",
            metadata: {
                stacEntityRef: `Feature:${item.id}`,
                stacEntity: JSON.stringify(item),
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
        if (ref) {
            const colonIndex = ref.indexOf(":");
            if (colonIndex !== -1) {
                const type = ref.slice(0, colonIndex);
                const id = ref.slice(colonIndex + 1);
                const entity = this.cache.get<STACEntity>(type, id);
                if (entity) return entity;
            }
        }

        // Fallback: parse from serialized metadata on cache miss
        const stacEntityString = node.metadata?.stacEntity as
            | string
            | undefined;
        if (stacEntityString) {
            try {
                return JSON.parse(stacEntityString) as STACEntity;
            } catch (error) {
                logger.warn(
                    `Failed to parse stacEntity from node ${node.id}:`,
                    error,
                );
            }
        }

        return null;
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
     * Augment point cloud layer configs with bounds and coordinate origin.
     */
    private augmentPointCloudRoles(
        roles: LayerNodeRoles,
        item: STACItem,
    ): void {
        const displayRole = roles.display;
        if (
            !displayRole.render.config ||
            displayRole.render.config.role !== "point-cloud"
        ) {
            return;
        }

        const bbox = new Bbox(item.bbox);
        const pcConfig = displayRole.render.config as PointCloudLayerConfig;

        pcConfig.coordinateOrigin = bbox.center;

        if (bbox.is3D) {
            pcConfig.bounds = bbox.bounds3D!;
        }
    }
}
