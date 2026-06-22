import type { BBox3D } from "./streaming";

/**
 * Minimal point cloud data structure for deck.gl visualization
 */
export interface PointCloudData {
    /**
     * Float32Array of XYZ positions as degree offsets from coordinateOrigin (length = pointCount * 3)
     * Format: [deltaLng, deltaLat, elevation] for each point
     * Uses Float32Array with LNGLAT_OFFSETS coordinate system (WGS84 degrees)
     */
    positions: Float32Array;

    /**
     * Coordinate origin [lng, lat, 0] in WGS84 degrees - positions are offsets from this point
     * Center of the bounding box, allows Float32Array precision for degree coordinates
     */
    coordinateOrigin: [number, number, number];

    /**
     * Optional Uint8Array of RGB colors (length = pointCount * 4, RGBA format)
     */
    colors?: Uint8Array;

    /**
     * Optional Float32Array of intensity values normalized to 0-1 (length = pointCount)
     */
    intensities?: Float32Array;

    /**
     * Optional Uint8Array of LAS classification codes (length = pointCount)
     */
    classifications?: Uint8Array;

    /**
     * Number of points in the cloud
     */
    pointCount: number;

    /**
     * Bounding box of the point cloud in absolute WGS84 coordinates (degrees)
     */
    bounds: BBox3D;
}

/**
 * Type guards for optional PointCloudData arrays
 */
export function hasRGB(
    data: PointCloudData,
): data is PointCloudData & { colors: Uint8Array } {
    return data.colors !== undefined;
}

export function hasIntensity(
    data: PointCloudData,
): data is PointCloudData & { intensities: Float32Array } {
    return data.intensities !== undefined;
}

export function hasClassification(
    data: PointCloudData,
): data is PointCloudData & { classifications: Uint8Array } {
    return data.classifications !== undefined;
}

/**
 * Color scheme enum for point cloud rendering.
 */
export enum ColorScheme {
    ELEVATION = "elevation",
    INTENSITY = "intensity",
    RGB = "rgb",
    CLASSIFICATION = "classification",
}

/**
 * Minimal options for the point cloud loader
 */
export interface LoaderOptions {
    /**
     * Progress callback
     * @param progress - Progress percentage (0-100)
     * @param message - Optional status message
     */
    onProgress?: (progress: number, message?: string) => void;

    /**
     * Optional bounds from metadata in WGS84 degrees (EPSG:4326)
     * Format: [minLng, minLat, minZ, maxLng, maxLat, maxZ]
     */
    metadataBounds?: [number, number, number, number, number, number];
}
