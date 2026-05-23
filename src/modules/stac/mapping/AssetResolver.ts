import type { STACItem, STACAsset } from "../types";
import { TileRoles, ReportRoles, getAssetsByRole } from "../types";
import { LayerRoles, type LayerRole } from "@core/framework/types";

/**
 * Extended tile roles for STAC API compatibility
 * Includes standard STAC roles and common variations
 */
const ExtendedRasterRoles = [
    TileRoles.RASTER_TILE, // "raster-tile"
    "visual", // Common visual role
    "data", // Microsoft Planetary Computer uses "data" for COG
    "cog", // Cloud Optimized GeoTIFF
    "geotiff", // GeoTIFF
    "image", // Generic image
] as const;

export function getAssetInfo(item: STACItem): {
    asset?: STACAsset;
    role?: LayerRole;
    isReport: boolean;
} {
    // Prioritization: raster-tile > visual/data (raster) > vector-tile > point-cloud > report

    // Check for raster tile roles (including extended roles)
    for (const rasterRole of ExtendedRasterRoles) {
        const rasterAssets = getAssetsByRole(item.assets, rasterRole);
        if (rasterAssets.length > 0) {
            return {
                asset: rasterAssets[0]!,
                role: LayerRoles.RASTER,
                isReport: false,
            };
        }
    }

    const vectorAssets = getAssetsByRole(item.assets, TileRoles.VECTOR_TILE);
    if (vectorAssets.length > 0) {
        return {
            asset: vectorAssets[0]!,
            role: LayerRoles.VECTOR,
            isReport: false,
        };
    }

    const pointCloudAssets = getAssetsByRole(
        item.assets,
        TileRoles.POINT_CLOUD,
    );
    if (pointCloudAssets.length > 0) {
        return {
            asset: pointCloudAssets[0]!,
            role: LayerRoles.POINT_CLOUD,
            isReport: false,
        };
    }

    const reportAssets = getAssetsByRole(item.assets, ReportRoles.REPORT);
    if (reportAssets.length > 0) {
        return {
            asset: reportAssets[0]!,
            isReport: true,
        };
    }

    return { isReport: false };
}
