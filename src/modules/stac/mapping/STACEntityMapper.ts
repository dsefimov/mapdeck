import { observable } from "mobx";
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
import { Bbox, flattenTo2D } from "@core/shared/geo";
import type { STACCache } from "../core/STACCache";
import type { PointCloudLayerConfig } from "@core/framework/types";

export class STACEntityMapper {
    constructor(private cache: STACCache) {}

    mapCollectionToGroupNode(collection: STACCollection): TreeNode {
        // Flatten bbox for zoom functionality - bbox is always required
        const flattenedBbox = flattenTo2D(
            new Bbox(collection.extent.spatial.bbox[0]!),
        );

        // Map collection-level assets to roles (e.g., reports)
        const roles: NodeRoles = collection.assets
            ? mapAssetsToNodeRoles(collection.assets)
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
                extent: collection.extent,
            },
            parentId: null,
            childrenIds: observable.array<string>([]),
            bbox: flattenedBbox,
            roles,
            isExtended: false,
            isVisible: false,
        } as GroupNode;
    }

    mapItemToLayerNode(item: STACItem): TreeNode | null {
        const roles = mapAssetsToNodeRoles(item.assets, item.properties);

        if (roles.reports.length === 0 && !roles.display && !roles.attribute) {
            logger.warn(`Item ${item.id} has no recognized assets, skipping`);
            return null;
        }

        // Resolve conflicts: keep only one display role and one attribute role
        const layerRoles = this._resolveRoleConflicts(roles);
        if (!layerRoles) {
            logger.warn(
                `Item ${item.id} has no display roles, skipping as layer`,
            );
            return null;
        }

        this._augmentPointCloudRoles(layerRoles, item);

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
                itemBbox: [...item.bbox],
            },
            parentId: null,
            bbox: flattenedBbox,
            roles: layerRoles,
            isVisible: false,
        };

        return layerNode;
    }

    /**
     * Create a node from a STAC item.
     * Returns a LayerNode if the item has display roles, or a GroupNode stub
     * if it only has report/attribute roles (for future use).
     */
    createNodeFromItem(item: STACItem): TreeNode | null {
        return this.mapItemToLayerNode(item);
    }

    getSTACEntityFromNode(node: TreeNode): STACEntity | null {
        const stacEntityRef = node.metadata?.stacEntityRef as string;
        if (stacEntityRef) {
            const [type, id] = stacEntityRef.split(":");
            if (type && id) {
                const entity = this.cache.get<STACEntity>(type, id);
                if (entity) return entity;
            }
        }

        const stacEntityString = node.metadata?.stacEntity as string;
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
    private _resolveRoleConflicts(roles: NodeRoles): LayerNodeRoles | null {
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
    private _augmentPointCloudRoles(
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
