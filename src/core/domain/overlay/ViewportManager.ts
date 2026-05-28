import type { Map as MapLibreMap } from "maplibre-gl";
import type { ViewportInfo, PointCloudBounds } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";

/**
 * Options for the ViewportManager
 */
export interface ViewportManagerOptions {
    /**
     * Debounce time for viewport changes in ms
     * @default 150
     */
    debounceMs?: number;

    /**
     * Maximum octree depth to load
     * @default 20
     */
    maxOctreeDepth?: number;

    /**
     * Octree spacing value from COPC file (for accurate depth calculation)
     */
    spacing: number;

    /**
     * Point cloud bounds for distance calculation (in meters)
     */
    cloudBounds?: PointCloudBounds;
}

/**
 * Debounces a function call
 */
function debounce<T extends (...args: unknown[]) => void>(
    fn: T,
    delay: number,
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    return (...args: Parameters<T>) => {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = null;
        }, delay);
    };
}

/**
 * Manages viewport state and triggers node loading based on map view changes.
 * Listens to MapLibre GL map events and calculates the appropriate octree
 * depth for the current zoom level and pitch.
 */
export class ViewportManager {
    private _map: MapLibreMap;
    private _debounceMs: number;
    private _onViewportChange: (viewport: ViewportInfo) => void;
    private _debouncedHandler: () => void;
    private _isActive: boolean = false;

    // Zoom to octree depth mapping configuration
    private _maxOctreeDepth: number;
    private _spacing: number;
    private _cloudBounds: PointCloudBounds | null;

    /**
     * Creates a new ViewportManager instance.
     *
     * @param map - MapLibre GL map instance
     * @param onViewportChange - Callback fired when viewport changes
     * @param options - Configuration options
     */
    constructor(
        map: MapLibreMap,
        onViewportChange: (viewport: ViewportInfo) => void,
        options?: ViewportManagerOptions,
    ) {
        this._map = map;
        this._onViewportChange = onViewportChange;

        const {
            debounceMs = 150,
            maxOctreeDepth = 20,
            spacing = 0,
            cloudBounds = null,
        } = options || {};

        this._debounceMs = debounceMs;
        this._maxOctreeDepth = maxOctreeDepth;
        this._spacing = spacing;
        this._cloudBounds = cloudBounds;

        this._debouncedHandler = debounce(
            () => this._handleViewportChange(),
            this._debounceMs,
        );
    }

    /**
     * Starts listening to map viewport changes.
     */
    start(): void {
        if (this._isActive) return;
        this._isActive = true;

        this._map.on("moveend", this._debouncedHandler);
        this._map.on("zoomend", this._debouncedHandler);
        this._map.on("pitchend", this._debouncedHandler);

        // Trigger initial viewport calculation
        this._handleViewportChange();
    }

    /**
     * Stops listening to map viewport changes.
     */
    stop(): void {
        if (!this._isActive) return;
        this._isActive = false;

        this._map.off("moveend", this._debouncedHandler);
        this._map.off("zoomend", this._debouncedHandler);
        this._map.off("pitchend", this._debouncedHandler);
    }

    /**
     * Gets the current viewport information.
     *
     * @returns ViewportInfo object with bounds, center, zoom, pitch, and targetDepth
     */
    getCurrentViewport(): ViewportInfo {
        const bounds = this._map.getBounds();
        const center = this._map.getCenter();
        const zoom = this._map.getZoom();
        const pitch = this._map.getPitch();

        const distanceToCloud = this._calculateDistanceToCloud(
            center.lng,
            center.lat,
        );
        const targetDepth = this._calculateTargetDepth(
            zoom,
            pitch,
            distanceToCloud,
        );

        const viewportInfo: ViewportInfo = {
            bounds: [
                bounds.getWest(),
                bounds.getSouth(),
                bounds.getEast(),
                bounds.getNorth(),
            ],
            center: [center.lng, center.lat],
            zoom,
            pitch,
            targetDepth,
            distanceToCloud,
        };

        return viewportInfo;
    }

    /**
     * Calculates target octree depth based on zoom level, pitch, and distance to cloud.
     *
     * Mapping strategy:
     * - Zoom 0-10: depth 0-2 (overview)
     * - Zoom 10-14: depth 2-6 (city level)
     * - Zoom 14-18: depth 6-12 (block level)
     * - Zoom 18+: depth 12+ (detail level)
     *
     * Pitch adjustment: higher pitch (3D view) reduces depth to avoid
     * loading too many nodes in the distance.
     *
     * Distance adjustment: greater distance reduces depth to avoid
     * loading unnecessary detail for distant clouds.
     *
     * @param zoom - Current map zoom level
     * @param pitch - Current map pitch in degrees
     * @param distanceToCloud - Distance from viewport center to cloud bounds in meters
     * @returns Target octree depth
     */
    private _calculateTargetDepth(
        zoom: number,
        pitch: number,
        distanceToCloud: number,
    ): number {
        const groundRes = 156543.03 / Math.pow(2, zoom);
        let depth = Math.floor(Math.log2(this._spacing / groundRes));
        depth = Math.max(0, depth);

        const pitchRadians = (pitch * Math.PI) / 180;
        const pitchFactor = Math.cos(pitchRadians);
        const pitchReduction = Math.floor((1 - pitchFactor) * 3);
        depth = Math.max(0, depth - pitchReduction);

        const distanceKm = distanceToCloud / 1000;
        if (distanceKm > 1) {
            depth = Math.max(0, depth - Math.floor(Math.log2(distanceKm)));
        }

        depth = Math.min(depth, this._maxOctreeDepth);

        logger.debug(`[DEPTH] zoom=${zoom}, depth=${depth}`);

        return depth;
    }

    /**
     * Handles viewport change events.
     */
    private _handleViewportChange(): void {
        if (!this._isActive) return;
        const viewport = this.getCurrentViewport();
        this._onViewportChange(viewport);
    }

    /**
     * Forces a viewport update (e.g., after initial data load or fly animation).
     */
    forceUpdate(): void {
        this._handleViewportChange();
    }

    /**
     * Calculates distance from viewport center to point cloud bounds.
     * Returns distance in meters. If cloud bounds not available, returns 0.
     */
    private _calculateDistanceToCloud(lng: number, lat: number): number {
        if (!this._cloudBounds) {
            return 0;
        }

        // Calculate distance from viewport center to the nearest point of cloud bounds
        // Simple 2D Euclidean distance in meters (approximation)
        // Convert lat/lng to meters using approximate conversion
        const metersPerDegreeLat = 111320; // meters per degree latitude
        const metersPerDegreeLng = 111320 * Math.cos((lat * Math.PI) / 180);

        const cloudCenterX =
            (this._cloudBounds.minX + this._cloudBounds.maxX) / 2;
        const cloudCenterY =
            (this._cloudBounds.minY + this._cloudBounds.maxY) / 2;

        const dx = (lng - cloudCenterX) * metersPerDegreeLng;
        const dy = (lat - cloudCenterY) * metersPerDegreeLat;

        return Math.sqrt(dx * dx + dy * dy);
    }

    /**
     * Checks if the viewport manager is currently active.
     *
     * @returns True if listening for viewport changes
     */
    isActive(): boolean {
        return this._isActive;
    }

    /**
     * Destroys the viewport manager and removes all event listeners.
     */
    destroy(): void {
        this.stop();
    }
}
