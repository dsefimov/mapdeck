/**
 * Point cloud types shared by the COPC protocol, tools, and geometry helpers.
 */
import type { BBox3D, GeoPoint } from "@core/lib/geo";
import type { LayerAdapter } from "./render";
import type { ProtocolRegistry } from "./protocol";

/** A point picked from a point cloud, linked back to its source layer. */
export interface CloudPoint extends GeoPoint {
    layerId: string;
    pointIndex: number;
    coordinateOrigin: [number, number, number];
}

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
 * Color scheme enum for point cloud rendering.
 */
export enum ColorScheme {
    ELEVATION = "elevation",
    INTENSITY = "intensity",
    RGB = "rgb",
    CLASSIFICATION = "classification",
}

/**
 * Read access to loaded cloud data, served by a point cloud protocol's
 * adapter. Tools consume this port instead of a concrete adapter class.
 */
export interface PointCloudDataAdapter {
    /** Loaded data of one layer, or undefined when the layer has none. */
    getLoadedData(layerId: string): PointCloudData | undefined;

    /** Loaded data across all layers of the protocol. */
    getAllLoadedData(): PointCloudData[];
}

/**
 * Narrow a protocol adapter to the point cloud data port. Runtime-checked
 * crossing at the protocol boundary: null when the adapter serves no clouds.
 */
export function toPointCloudDataAdapter(
    adapter: LayerAdapter | undefined,
): PointCloudDataAdapter | null {
    if (!adapter) return null;
    const candidate = adapter as Partial<PointCloudDataAdapter>;
    return typeof candidate.getLoadedData === "function" &&
        typeof candidate.getAllLoadedData === "function"
        ? (candidate as PointCloudDataAdapter)
        : null;
}

/**
 * Find a cloud-capable adapter across the whole protocol registry — the
 * capability lookup of ADR-0012. Naming no protocol id, a second cloud
 * protocol registered by a module is visible here with zero changes. With
 * `layerId`, only an adapter actually holding that layer's data matches;
 * returns null when no protocol serves clouds.
 */
export function findPointCloudDataAdapter(
    registry: ProtocolRegistry,
    layerId?: string,
): PointCloudDataAdapter | null {
    for (const protocol of registry.getAll()) {
        const adapter = toPointCloudDataAdapter(protocol.getLayerAdapter());
        if (!adapter) continue;
        if (
            layerId === undefined ||
            adapter.getLoadedData(layerId) !== undefined
        ) {
            return adapter;
        }
    }
    return null;
}
