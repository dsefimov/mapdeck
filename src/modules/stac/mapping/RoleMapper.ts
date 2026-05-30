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
import { Bbox } from "@core/framework/types";

// ─── Display role priority ────────────────────────────────────────────────
const ROLE_PRIORITY: readonly string[] = [
    TileRoles.POINT_CLOUD,
    TileRoles.VECTOR3D,
    TileRoles.VECTOR_TILE,
    TileRoles.RASTER_TILE,
    "wms",
    "ogc",
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
type DisplayMapping = { role: LayerRole; type?: "xyz" | "wms" | "cog" };

const STANDARD_DISPLAY_MAPPING: Record<string, DisplayMapping> = {
    visual: { role: LayerRoles.RASTER, type: "cog" },
    data: { role: LayerRoles.RASTER, type: "cog" },
};

const EXTENDED_DISPLAY_MAPPING: Record<string, DisplayMapping> = {
    [TileRoles.RASTER_TILE]: { role: LayerRoles.RASTER, type: "xyz" },
    cog: { role: LayerRoles.RASTER, type: "cog" },
    geotiff: { role: LayerRoles.RASTER, type: "cog" },
    image: { role: LayerRoles.RASTER, type: "cog" },
    [TileRoles.VECTOR_TILE]: { role: LayerRoles.VECTOR },
    [TileRoles.POINT_CLOUD]: { role: LayerRoles.POINT_CLOUD },
    [TileRoles.VECTOR3D]: { role: LayerRoles.VECTOR3D },
    wms: { role: LayerRoles.RASTER, type: "wms" },
    ogc: { role: LayerRoles.VECTOR },
};

const INCOMING_MAPPING: Record<string, DisplayMapping> = {
    ...STANDARD_DISPLAY_MAPPING,
    ...EXTENDED_DISPLAY_MAPPING,
};

const REPORT_ROLES = new Set<string>([
    ReportRoles.REPORT,
    ReportRoles.METADATA,
]);
const ATTRIBUTE_ROLES = new Set<string>(["wfs", "ogc-feature-api"]);

export function mapAssetToNodeRole( // eslint-disable-line max-params
    assetKey: string,
    asset: STACAsset,
    registry: LayerConfigRegistry,
    properties?: Record<string, unknown>,
    itemBbox?: readonly number[],
): NodeRole | null {
    const assetRoles = asset.roles ?? [];

    for (const role of assetRoles) {
        if (REPORT_ROLES.has(role)) {
            return createReportRole(assetKey, asset, properties);
        }
    }

    for (const role of assetRoles) {
        if (ATTRIBUTE_ROLES.has(role)) {
            return createAttributeRole(assetKey, asset, role);
        }
    }

    const sortedDisplayRoles = [...assetRoles].sort(
        (a, b) => getRolePriority(a) - getRolePriority(b),
    );
    for (const role of sortedDisplayRoles) {
        const mapping = INCOMING_MAPPING[role];
        if (mapping) {
            return createDisplayRole(
                assetKey,
                asset,
                mapping,
                registry,
                itemBbox,
            );
        }
    }

    return null;
}

export function mapAssetsToNodeRoles(
    assets: Record<string, STACAsset>,
    registry: LayerConfigRegistry,
    properties?: Record<string, unknown>,
    itemBbox?: readonly number[],
): NodeRoles {
    const displayRoles: DisplayRole[] = [];
    const attributeRoles: AttributeRole[] = [];
    const reportRoles: ReportRole[] = [];

    for (const [key, asset] of Object.entries(assets)) {
        const role = mapAssetToNodeRole(
            key,
            asset,
            registry,
            properties,
            itemBbox,
        );
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

function createDisplayRole( // eslint-disable-line max-params
    assetKey: string,
    asset: STACAsset,
    mapping: DisplayMapping,
    registry: LayerConfigRegistry,
    itemBbox?: readonly number[],
): DisplayRole {
    const layerConfig = registry.create(mapping.role);
    const cfg = layerConfig as unknown as Record<string, unknown>;

    cfg.url = asset.href;

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
    }

    // Augment point cloud config with bbox-derived values
    if (mapping.role === LayerRoles.POINT_CLOUD && itemBbox) {
        const bbox = new Bbox(itemBbox);
        cfg.coordinateOrigin = bbox.center;
        if (bbox.is3D) {
            cfg.bounds = bbox.bounds3D;
        }
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
        label: asset.title || "Attribute Table",
        sourceUrl: asset.href,
        attributeConfig,
    };

    if (asset.type) {
        result.mimeType = asset.type;
    }

    return result;
}
