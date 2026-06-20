import type { Map as MapLibreMap } from "maplibre-gl";
import type { ViewportInfo } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import type {
    CameraSnapshot,
    FrustumPlanes,
    ProjectToCommonSpace,
    CenterOffset,
} from "./geometry";
import type { Viewport } from "@deck.gl/core";

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
     * External camera position provider. When provided, replaces the built-in
     * altitude calculation with deck.gl's authoritative view-matrix position.
     */
    getCameraPosition?: () => [number, number, number];

    /**
     * External frustum planes provider. When provided, enables 3D frustum
     * culling via deck.gl Viewport.getFrustumPlanes().
     */
    getFrustumPlanes?: () => FrustumPlanes | null;

    /** External Viewport provider for common-space projection and center offset. */
    getActiveViewport?: () => Viewport | null;

    /**
     * Optional immediate (non-debounced) callback for render updates.
     * Fires on every `move` event — keep it fast (frustum filter + lightweight copy).
     */
    onImmediateChange?: ViewportChangeCallback;
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
 * Viewport change callback signature.
 * Provides frustum planes, camera position, and FOV — everything
 * needed for SSE-based traversal with proper 3D frustum culling.
 */
export type ViewportChangeCallback = (
    viewport: ViewportInfo,
    camera: CameraSnapshot,
) => void;

/**
 * Manages viewport state and triggers node loading based on map view changes.
 * Listens to MapLibre GL map events, extracts frustum geometry and camera
 * position, and fires a callback with everything needed for SSE traversal.
 */
export class ViewportManager {
    private _map: MapLibreMap;
    private _debounceMs: number;
    private _onViewportChange: ViewportChangeCallback;
    private _onImmediateChange: ViewportChangeCallback | undefined;
    private _debouncedHandler: () => void;
    private _immediateHandler: (() => void) | undefined;
    private _isActive: boolean = false;
    private _getCameraPosition: (() => [number, number, number]) | undefined;
    private _getFrustumPlanes: (() => FrustumPlanes | null) | undefined;
    private _getActiveViewport: (() => Viewport | null) | undefined;

    constructor(
        map: MapLibreMap,
        onViewportChange: ViewportChangeCallback,
        options?: ViewportManagerOptions,
    ) {
        this._map = map;
        this._onViewportChange = onViewportChange;

        const {
            debounceMs = 150,
            getCameraPosition,
            getFrustumPlanes,
            getActiveViewport,
            onImmediateChange,
        } = options || {};

        this._debounceMs = debounceMs;
        this._getCameraPosition = getCameraPosition;
        this._getFrustumPlanes = getFrustumPlanes;
        this._getActiveViewport = getActiveViewport;
        this._onImmediateChange = onImmediateChange;

        this._debouncedHandler = debounce(
            () => this._handleViewportChange(),
            this._debounceMs,
        );

        if (onImmediateChange) {
            this._immediateHandler = () => this._handleImmediateChange();
        }
    }

    /** Start listening to map viewport changes. */
    start(): void {
        if (this._isActive) return;
        this._isActive = true;

        this._map.on("moveend", this._debouncedHandler);
        this._map.on("zoomend", this._debouncedHandler);
        this._map.on("pitchend", this._debouncedHandler);

        if (this._immediateHandler) {
            this._map.on("move", this._immediateHandler);
        }

        // Trigger initial calculation
        this._handleViewportChange();
    }

    /** Stop listening to map viewport changes. */
    stop(): void {
        if (!this._isActive) return;
        this._isActive = false;

        this._map.off("moveend", this._debouncedHandler);
        this._map.off("zoomend", this._debouncedHandler);
        this._map.off("pitchend", this._debouncedHandler);

        if (this._immediateHandler) {
            this._map.off("move", this._immediateHandler);
        }
    }

    /** Get current viewport info (bounds, center, zoom, pitch). */
    getCurrentViewport(): ViewportInfo {
        const bounds = this._map.getBounds();
        const center = this._map.getCenter();
        const zoom = this._map.getZoom();
        const pitch = this._map.getPitch();

        return {
            bounds: [
                bounds.getWest(),
                bounds.getSouth(),
                bounds.getEast(),
                bounds.getNorth(),
            ],
            center: [center.lng, center.lat],
            zoom,
            pitch,
        };
    }

    /** Force a viewport update (e.g., after initial data load or fly animation). */
    forceUpdate(): void {
        this._handleViewportChange();
    }

    /** Check if the viewport manager is currently active. */
    isActive(): boolean {
        return this._isActive;
    }

    /** Destroy the viewport manager and remove all event listeners. */
    destroy(): void {
        this.stop();
    }

    private _handleViewportChange(): void {
        if (!this._isActive) return;
        const state = this._computeViewportState();
        if (!state) return;

        const [viewportInfo] = state;
        logger.debug(
            `[VIEWPORT] bounds=${viewportInfo.bounds.map((v) =>
                v.toFixed(4),
            )}, zoom=${viewportInfo.zoom.toFixed(1)}`,
        );

        this._onViewportChange(...state);
    }

    /** Non-debounced handler: same frustum computation, separate callback. */
    private _handleImmediateChange(): void {
        if (!this._isActive || !this._onImmediateChange) return;
        const state = this._computeViewportState();
        if (!state) return;
        this._onImmediateChange(...state);
    }

    /** Compute frustum & camera state shared between debounced and immediate handlers. */
    // eslint-disable-next-line complexity
    private _computeViewportState(): Parameters<ViewportChangeCallback> | null {
        const cameraPos = this._getCameraPosition?.();
        if (!cameraPos) return null;

        const frustumPlanes = this._getFrustumPlanes?.();
        if (!frustumPlanes) return null;

        const vp = this._getActiveViewport?.();
        if (!vp) return null;

        const [cx = 0, cy = 0, cz = 0] = vp.center ?? [];
        const centerOffset: CenterOffset = [cx, cy, cz];

        const projectToCommonSpace: ProjectToCommonSpace = (lng, lat, alt) =>
            vp.projectPosition([lng, lat, alt]) as [number, number, number];

        const viewportInfo = this.getCurrentViewport();
        const fovRadians =
            (((this._map as { getFov?: () => number }).getFov?.() ?? 60) *
                Math.PI) /
            180;

        return [
            viewportInfo,
            {
                frustumPlanes,
                cameraPos,
                fovRadians,
                projectToCommonSpace,
                centerOffset,
                screenHeightPx:
                    typeof window !== "undefined" ? window.innerHeight : 1080,
            },
        ];
    }
}
