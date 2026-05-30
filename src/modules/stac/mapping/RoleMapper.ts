/**
 * RoleMapper — maps STAC asset roles to NodeRoles.
 *
 * This is the ONLY place where STAC knowledge lives.
 * Core types (NodeRoles, LayerRole, LayerConfig) know nothing about STAC.
 */
import { logger } from "@core/shared/diagnostics/logger";
import {
    LayerRoles,
    type LayerRole,
    makeRenderDescriptor,
} from "@core/framework/types";
import type { LayerConfigRegistry } from "@core/domain/adapters";
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

// ─── Display role priority ────────────────────────────────────────────────
// More specific roles win over generic ones when an asset has multiple roles.
const ROLE_PRIORITY: readonly string[] = [
    TileRoles.POINT_CLOUD,
    TileRoles.VECTOR3D,
    TileRoles.VECTOR_TILE,
    TileRoles.RASTER_TILE,
    "wms",
    "visual",
    "data",
    "cog",
    "geotiff",
    "image",
];

function getRolePriority(role: string): number {
    const idx = ROLE_PRIORITY.indexOf(role);
    return idx === -1 ? Infinity : idx;
}

// ─── Display role mapping ─────────────────────────────────────────────────
// Split into standard STAC roles and project-specific extensions.
// This makes it clear which roles are part of the official STAC spec
// and which are custom / community conventions.

type DisplayMapping = { role: LayerRole; type?: "xyz" | "wms" | "cog" };

/**
 * Official STAC roles that hint at rendering type.
 * @see https://github.com/radiantearth/stac-spec/blob/master/item-spec/item-spec.md#asset-role-types
 */
const STANDARD_DISPLAY_MAPPING: Record<string, DisplayMapping> = {
    visual: { role: LayerRoles.RASTER, type: "cog" },
    data: { role: LayerRoles.RASTER, type: "cog" },
};

/**
 * Project-specific / community extension roles for precise rendering control.
 */
const EXTENDED_DISPLAY_MAPPING: Record<string, DisplayMapping> = {
    [TileRoles.RASTER_TILE]: { role: LayerRoles.RASTER, type: "xyz" },
    cog: { role: LayerRoles.RASTER, type: "cog" },
    geotiff: { role: LayerRoles.RASTER, type: "cog" },
    image: { role: LayerRoles.RASTER, type: "cog" },
    [TileRoles.VECTOR_TILE]: { role: LayerRoles.VECTOR },
    [TileRoles.POINT_CLOUD]: { role: LayerRoles.POINT_CLOUD },
    [TileRoles.VECTOR3D]: { role: LayerRoles.VECTOR3D },
    wms: { role: LayerRoles.RASTER, type: "wms" },
};

/**
 * Combined mapping from STAC asset role to LayerRole + type.
 */
const INCOMING_MAPPING: Record<string, DisplayMapping> = {
    ...STANDARD_DISPLAY_MAPPING,
    ...EXTENDED_DISPLAY_MAPPING,
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
    registry: LayerConfigRegistry,
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

    // Check for display roles — sort by priority so the most specific wins
    const sortedDisplayRoles = [...assetRoles].sort(
        (a, b) => getRolePriority(a) - getRolePriority(b),
    );
    for (const role of sortedDisplayRoles) {
        const mapping = INCOMING_MAPPING[role];
        if (mapping) {
            return createDisplayRole(assetKey, asset, mapping, registry);
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
    registry: LayerConfigRegistry,
    properties?: Record<string, unknown>,
): NodeRoles {
    const displayRoles: DisplayRole[] = [];
    const attributeRoles: AttributeRole[] = [];
    const reportRoles: ReportRole[] = [];

    for (const [key, asset] of Object.entries(assets)) {
        const role = mapAssetToNodeRole(key, asset, registry, properties);
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
    if (displayRoles[0]) {
        if (displayRoles.length > 1) {
            logger.debug(
                `Item has ${displayRoles.length} display roles, using first: ${displayRoles[0].id}`,
            );
        }
        result.display = displayRoles[0];
    }
    if (attributeRoles[0]) {
        if (attributeRoles.length > 1) {
            logger.debug(
                `Item has ${attributeRoles.length} attribute roles, using first: ${attributeRoles[0].id}`,
            );
        }
        result.attribute = attributeRoles[0];
    }
    return result;
}

// ==================== Private helpers ====================

function createDisplayRole(
    assetKey: string,
    asset: STACAsset,
    mapping: { role: LayerRole; type?: "xyz" | "wms" | "cog" },
    registry: LayerConfigRegistry,
): DisplayRole {
    const layerConfig = registry.create(mapping.role);
    const cfg = layerConfig as unknown as Record<string, unknown>;

    // Set URL from asset href
    cfg.url = asset.href;

    // Set type for raster
    if (mapping.role === LayerRoles.RASTER && mapping.type) {
        cfg.type = mapping.type;
    }

    // Resolve WMS layers with fallback chain:
    // 1. wms:layers asset field (WMS Extension) — explicit STAC metadata
    // 2. LAYERS param extracted from full GetMap URL (static STAC catalogs) — handled by getWmsLayerName()
    if (mapping.type === "wms") {
        if (asset["wms:layers"]) {
            cfg.layers = asset["wms:layers"];
        }
        // If wms:layers is not set, cfg.layers stays undefined.
        // getWmsLayerName() will extract LAYERS from URL if present
        // (e.g. full GetMap URL from static STAC catalogs).
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
