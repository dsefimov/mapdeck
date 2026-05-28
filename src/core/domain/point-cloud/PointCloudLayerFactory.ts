import { COORDINATE_SYSTEM, type Layer } from "@deck.gl/core";
import { PointCloudLayer } from "@deck.gl/layers";
import { type PointCloudLayerConfig, type PointCloudData } from "@core/framework/types";

/**
 * Factory for creating deck.gl PointCloudLayer instances from PointCloudLayerConfig.
 * Colors are pre-computed by PointProcessingWorker and passed via data.colors.
 */
export class PointCloudLayerFactory {
    /**
     * Creates a deck.gl PointCloudLayer from point cloud data and config.
     *
     * @param layerId - Layer identifier
     * @param data - Point cloud data (colors pre-computed by worker)
     * @param config - Layer configuration
     * @returns deck.gl Layer instance
     */
    static createLayer(
        layerId: string,
        data: PointCloudData,
        config: PointCloudLayerConfig,
        version: number = 0,
    ): Layer {
        const { pointSize = 2, opacity = 1.0 } = config;

        return new PointCloudLayer({
            id: layerId,
            coordinateSystem: COORDINATE_SYSTEM.LNGLAT_OFFSETS,
            coordinateOrigin: data.coordinateOrigin,
            data: {
                length: data.pointCount,
                attributes: {
                    getPosition: { value: data.positions, size: 3 },
                    getColor: data.colors
                        ? { value: data.colors, size: 4 }
                        : {
                              value: new Uint8Array(data.pointCount * 4).fill(
                                  255,
                              ),
                              size: 4,
                          },
                },
            },
            pointSize,
            opacity,
            pickable: true,
            sizeUnits: "pixels",
            getNormal: [0, 0, 1],
            // Version-based triggers: deck.gl skips GPU re-upload when version unchanged
            updateTriggers: {
                getPosition: [version],
                getColor: [version],
            },
        });
    }
}
