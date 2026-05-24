/**
 * RoleMapper — maps STAC asset roles to NodeRoles.
 *
 * This is the ONLY place where STAC knowledge lives.
 * Core types (NodeRoles, LayerRole, LayerConfig) know nothing about STAC.
 */
import {
    LayerRoles,
    type LayerRole,
    makeRenderDescriptor,
} from "@core/framework/types";
import { createDefaultConfig } from "@core/domain/adapters";
import type {
    DisplayRole,
    AttributeRole,
    ReportRole,
    NodeRole,
    NodeRoles,
    NodeAttributeConfig,
} from "@core/framework/types";
import type { STACAsset } from "../types";
import { TileRoles, ReportRoles } from "../types";

/**
 * Mapping from STAC asset role to LayerRole + type.
 * Only incoming mapping — application does not know about STAC.
 */
const INCOMING_MAPPING: Record<
    string,
    { role: LayerRole; type?: "xyz" | "wms" | "cog" }
> = {
    [TileRoles.RASTER_TILE]: { role: LayerRoles.RASTER, type: "xyz" },
    visual: { role: LayerRoles.RASTER, type: "cog" },
    data: { role: LayerRoles.RASTER, type: "cog" },
    cog: { role: LayerRoles.RASTER, type: "cog" },
    geotiff: { role: LayerRoles.RASTER, type: "cog" },
    image: { role: LayerRoles.RASTER, type: "cog" },
    [TileRoles.VECTOR_TILE]: { role: LayerRoles.VECTOR },
    [TileRoles.POINT_CLOUD]: { role: LayerRoles.POINT_CLOUD },
    [TileRoles.VECTOR3D]: { role: LayerRoles.VECTOR3D },
    wms: { role: LayerRoles.RASTER, type: "wms" },
};

/**
 * STAC asset roles that map to report NodeRoles.
 */
const REPORT_ROLES = new Set<string>([
    ReportRoles.REPORT,
    ReportRoles.METADATA,
]);

/**
 * STAC asset roles that map to attribute NodeRoles (WFS endpoints).
 */
const ATTRIBUTE_ROLES = new Set<string>(["wfs", "ogc-feature-api"]);

/**
 * Map a single STAC asset to a NodeRole, or null if unrecognized.
 */
export function mapAssetToNodeRole(
    assetKey: string,
    asset: STACAsset,
    properties?: Record<string, unknown>,
): NodeRole | null {
    const assetRoles = asset.roles ?? [];

    // Check for report roles
    for (const role of assetRoles) {
        if (REPORT_ROLES.has(role)) {
            return createReportRole(assetKey, asset, properties);
        }
    }

    // Check for attribute roles
    for (const role of assetRoles) {
        if (ATTRIBUTE_ROLES.has(role)) {
            return createAttributeRole(assetKey, asset, role);
        }
    }

    // Check for display roles (using mapping)
    for (const role of assetRoles) {
        const mapping = INCOMING_MAPPING[role];
        if (mapping) {
            return createDisplayRole(assetKey, asset, mapping);
        }
    }

    return null;
}

/**
 * Map all assets of a STAC entity (item or collection) to NodeRoles.
 *
 * For collections, pass `properties: undefined` — report roles will still work,
 * but `report:*` properties won't be populated.
 */
export function mapAssetsToNodeRoles(
    assets: Record<string, STACAsset>,
    properties?: Record<string, unknown>,
): NodeRoles {
    const displayRoles: DisplayRole[] = [];
    const attributeRoles: AttributeRole[] = [];
    const reportRoles: ReportRole[] = [];

    for (const [key, asset] of Object.entries(assets)) {
        const role = mapAssetToNodeRole(key, asset, properties);
        if (!role) continue;

        switch (role.category) {
            case "display":
                displayRoles.push(role as DisplayRole);
                break;
            case "attribute":
                attributeRoles.push(role as AttributeRole);
                break;
            case "report":
                reportRoles.push(role as ReportRole);
                break;
        }
    }

    const result: NodeRoles = { reports: reportRoles };
    if (displayRoles[0]) result.display = displayRoles[0];
    if (attributeRoles[0]) result.attribute = attributeRoles[0];
    return result;
}

// ==================== Private helpers ====================

function createDisplayRole(
    assetKey: string,
    asset: STACAsset,
    mapping: { role: LayerRole; type?: "xyz" | "wms" | "cog" },
): DisplayRole {
    const layerConfig = createDefaultConfig(mapping.role);
    const cfg = layerConfig as unknown as Record<string, unknown>;

    // Set URL from asset href
    cfg.url = asset.href;

    // Set type for raster
    if (mapping.role === LayerRoles.RASTER && mapping.type) {
        cfg.type = mapping.type;
    }

    // Set WMS layers if specified in asset title or description
    if (mapping.type === "wms") {
        cfg.layers = asset.title || assetKey;
    }

    const result: DisplayRole = {
        id: assetKey,
        category: "display",
        label: asset.title || assetKey,
        render: makeRenderDescriptor(mapping.role, asset.href, layerConfig),
    };

    if (asset.type) {
        result.mimeType = asset.type;
    }

    return result;
}

function createReportRole(
    assetKey: string,
    asset: STACAsset,
    _properties?: Record<string, unknown>,
): ReportRole {
    const result: ReportRole = {
        id: assetKey,
        category: "report",
        label: asset.title || assetKey,
        sourceUrl: asset.href,
    };

    if (asset.type) {
        result.mimeType = asset.type;
    }

    return result;
}

function createAttributeRole(
    assetKey: string,
    asset: STACAsset,
    adapterType: string,
): AttributeRole {
    const attributeConfig: NodeAttributeConfig = {
        endpointUrl: asset.href,
        type: adapterType,
    };

    if (asset.type) {
        attributeConfig.mimeType = asset.type;
    }

    const result: AttributeRole = {
        id: assetKey,
        category: "attribute",
        label: asset.title || "Таблица атрибутов",
        sourceUrl: asset.href,
        attributeConfig,
    };

    if (asset.type) {
        result.mimeType = asset.type;
    }

    return result;
}
