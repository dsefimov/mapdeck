import type { Map } from "maplibre-gl";
import type {
    LayerAdapter,
    RenderUnit,
    RenderDescriptor,
    MapContext,
} from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import { isVector3DConfig } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";

/**
 * Adapter for 3D vector layers (lines, paths).
 * Implements LayerAdapter interface for LayerRoles.VECTOR3D.
 *
 * Stub implementation — renders GeoJSON data from URL using maplibre line layer.
 */
export class Vector3DAdapter implements LayerAdapter<
    typeof LayerRoles.VECTOR3D
> {
    readonly role = LayerRoles.VECTOR3D;

    addToMap(
        layerId: string,
        descriptor: RenderDescriptor<typeof LayerRoles.VECTOR3D>,
        ctx: MapContext,
    ): void {
        try {
            const { map } = ctx;
            if (!isVector3DConfig(descriptor.config)) {
                throw new Error(
                    `Config is not for vector3d role: ${descriptor.config.role}`,
                );
            }

            const { config, sourceUrl } = descriptor;

            this._cleanupExisting(layerId, map);
            this._addSourceAndLayer(layerId, sourceUrl, config, map);

            const visible = config.visible ?? true;
            if (!visible) {
                this.updateVisibility(layerId, false, ctx);
            }
        } catch (error) {
            logger.error(
                `Vector3DAdapter: Failed to add layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    private _cleanupExisting(layerId: string, map: Map): void {
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
        if (map.getSource(layerId)) {
            map.removeSource(layerId);
        }
    }

    private _addSourceAndLayer(
        layerId: string,
        sourceRef: string,
        config: import("@core/framework/types").Vector3DLayerConfig,
        map: Map,
    ): void {
        map.addSource(layerId, {
            type: "geojson",
            data: sourceRef || config.url,
        });

        map.addLayer({
            id: layerId,
            type: "line",
            source: layerId,
            paint: {
                "line-color": config.lineColor ?? "#3f51b5",
                "line-width": config.lineWidth ?? 2,
                "line-opacity": config.opacity ?? 1.0,
            },
        });
    }

    removeFromMap(layerId: string, ctx: MapContext): void {
        const map = ctx.map;
        try {
            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
            if (map.getSource(layerId)) {
                map.removeSource(layerId);
            }
        } catch (error) {
            logger.error(
                `Vector3DAdapter: Failed to remove layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    updateVisibility(layerId: string, visible: boolean, ctx: MapContext): void {
        const map = ctx.map;
        try {
            if (map.getLayer(layerId)) {
                map.setLayoutProperty(
                    layerId,
                    "visibility",
                    visible ? "visible" : "none",
                );
            }
        } catch (error) {
            logger.error(
                `Vector3DAdapter: Failed to update visibility for "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    updateConfig(
        renderUnit: RenderUnit<typeof LayerRoles.VECTOR3D>,
        ctx: MapContext,
    ): void {
        this.removeFromMap(renderUnit.id, ctx);
        this.addToMap(renderUnit.id, renderUnit.descriptor, ctx);
    }
}
