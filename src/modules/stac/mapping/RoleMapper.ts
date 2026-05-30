import type {
    NodeRoles,
    DisplayRole,
    AttributeRole,
    ReportRole,
} from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import type { LayerConfigRegistry } from "@core/domain/adapters";
import { logger } from "@core/shared/diagnostics/logger";
import type { RoleResolverRegistry } from "../roles/RoleResolverRegistry";
import type { ResolveContext } from "../roles/IRoleResolver";
import type { STACAsset } from "../types";
import { resolveOgcFeaturesUrl } from "../roles/resolvers/GeoJsonRoleResolver";

export function mapAssetsToNodeRoles( // eslint-disable-line max-params
    assets: Readonly<Record<string, STACAsset>>,
    registry: RoleResolverRegistry,
    layerConfigRegistry: LayerConfigRegistry,
    properties?: Record<string, unknown>,
    itemBbox?: readonly number[],
    stac_extensions?: readonly string[],
): NodeRoles {
    const displayCandidates: DisplayRole[] = [];
    const attributeCandidates: AttributeRole[] = [];
    const reportRoles: ReportRole[] = [];

    for (const [assetKey, asset] of Object.entries(assets)) {
        const collected = resolveSingleAsset(
            assetKey,
            asset,
            registry,
            layerConfigRegistry,
            properties,
            itemBbox,
            stac_extensions,
        );
        if (!collected) continue;
        if (collected.display) displayCandidates.push(collected.display);
        if (collected.attribute) attributeCandidates.push(collected.attribute);
        if (collected.report) reportRoles.push(collected.report);
    }

    const { display, attribute } = resolveDisplayPriority(
        displayCandidates,
        attributeCandidates,
    );

    const result: NodeRoles = { reports: reportRoles };
    if (display) result.display = display;
    if (attribute) result.attribute = attribute;

    return result;
}

interface SingleAssetRoles {
    display?: DisplayRole;
    attribute?: AttributeRole;
    report?: ReportRole;
}

function resolveSingleAsset( // eslint-disable-line max-params
    assetKey: string,
    asset: STACAsset,
    registry: RoleResolverRegistry,
    layerConfigRegistry: LayerConfigRegistry,
    properties?: Record<string, unknown>,
    itemBbox?: readonly number[],
    stac_extensions?: readonly string[],
): SingleAssetRoles | null {
    const ctx: ResolveContext = {
        assetKey,
        registry: layerConfigRegistry,
        ...(properties !== undefined ? { properties } : {}),
        ...(itemBbox !== undefined ? { itemBbox } : {}),
        ...(stac_extensions !== undefined ? { stac_extensions } : {}),
    };

    const role = registry.resolve(asset, ctx);
    if (!role) return null;

    if (role.category === "display") {
        return resolveDisplayWithAttribute(role as DisplayRole, asset, ctx);
    }

    switch (role.category) {
        case "attribute":
            return { attribute: role as AttributeRole };
        case "report":
            return { report: role as ReportRole };
        default:
            return null;
    }
}

/**
 * When a GeoJSON display originates from an OGC API Features endpoint,
 * also expose the same source as an attribute table.
 */
function resolveDisplayWithAttribute(
    display: DisplayRole,
    asset: STACAsset,
    ctx: ResolveContext,
): SingleAssetRoles {
    const hasOgcRole = asset.roles?.includes("ogc") ?? false;
    const isGeoJsonDisplay = display.render.role === LayerRoles.GEOJSON;

    if (!hasOgcRole || !isGeoJsonDisplay) {
        return { display };
    }

    // OGC API Features collection endpoint returns metadata, not data.
    // Append /items to obtain the actual FeatureCollection.
    const itemsUrl = resolveOgcFeaturesUrl(asset.href);

    return {
        display,
        attribute: {
            id: ctx.assetKey,
            category: "attribute",
            label: asset.title ?? ctx.assetKey,
            sourceUrl: itemsUrl,
            ...(asset.type ? { mimeType: asset.type } : {}),
            attributeConfig: {
                endpointUrl: itemsUrl,
                type: "ogc-features",
            },
        },
    };
}

/**
 * Display priority rule:
 * If a raster or point-cloud display role exists — vector/geojson roles
 * degrade to attribute. If no attribute exists yet, the first degraded
 * vector/geojson takes its place.
 *
 * Pure function. No side effects.
 */
function resolveDisplayPriority(
    displayCandidates: DisplayRole[],
    attributeCandidates: AttributeRole[],
): {
    display: DisplayRole | undefined;
    attribute: AttributeRole | undefined;
} {
    if (displayCandidates.length === 0) {
        return { display: undefined, attribute: attributeCandidates[0] };
    }

    const rasterOrPcRoles = new Set([
        LayerRoles.RASTER,
        LayerRoles.POINT_CLOUD,
    ]);

    const rasterDisplays = displayCandidates.filter((d): boolean =>
        rasterOrPcRoles.has(d.render.role),
    );
    const vectorDisplays = displayCandidates.filter(
        (d): boolean => !rasterOrPcRoles.has(d.render.role),
    );

    if (rasterDisplays.length > 0) {
        if (rasterDisplays.length > 1) {
            logger.debug(
                `Multiple raster display roles, using first: ${rasterDisplays[0]!.id}`,
            );
        }
        // Vector/geojson candidates degrade to attribute
        const promotedAttribute: AttributeRole | undefined =
            vectorDisplays.length > 0
                ? degradeToAttribute(vectorDisplays[0]!)
                : undefined;

        return {
            display: rasterDisplays[0]!,
            attribute: attributeCandidates[0] ?? promotedAttribute,
        };
    }

    // No raster — first vector/geojson goes to display
    if (displayCandidates.length > 1) {
        logger.debug(
            `Multiple display roles, using first: ${displayCandidates[0]!.id}`,
        );
    }
    return {
        display: displayCandidates[0],
        attribute: attributeCandidates[0],
    };
}

/**
 * Converts a DisplayRole (vector/geojson) into an AttributeRole
 * for the attribute table.
 */
function degradeToAttribute(display: DisplayRole): AttributeRole {
    return {
        id: display.id,
        category: "attribute",
        label: display.label,
        sourceUrl: display.render.sourceUrl,
        ...(display.mimeType ? { mimeType: display.mimeType } : {}),
        attributeConfig: {
            endpointUrl: display.render.sourceUrl,
            type: display.render.role,
        },
    };
}
