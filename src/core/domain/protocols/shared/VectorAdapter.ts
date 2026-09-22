import type {
    LayerAdapter,
    RenderUnit,
    RenderDescriptor,
    MapContext,
} from "@core/contracts";
import { logger } from "@core/lib/logger";
import {
    parseVectorAdapterConfig,
    type VectorAdapterConfig,
} from "../logic/adapterConfig";
import { styleColor, styleNumber } from "../logic/styleValues";
import { DEFAULT_ACCENT_CSS, DEFAULT_TEXT_CSS } from "@core/ui/theme";
import {
    DEFAULT_LINE_WIDTH_PX,
    DEFAULT_POINT_RADIUS_PX,
    DEFAULT_LABEL_TEXT_SIZE_PX,
} from "./paintDefaults";
import type { LayerSpecification } from "maplibre-gl";
import {
    removeNativeLayerSource,
    setNativeVisibility,
} from "./nativeMapOps";

type LayerType = "fill" | "line" | "circle" | "symbol";

/** Only vector variants of the spec union carry the "source-layer" field. */
type VectorLayerSpec = LayerSpecification & { "source-layer"?: string };

/**
 * Adapter for vector tile layers.
 */
export class VectorAdapter implements LayerAdapter {
    readonly nativeLayerOrdering = true;

    addToMap(
        layerId: string,
        descriptor: RenderDescriptor,
        ctx: MapContext,
    ): void {
        try {
            const { map } = ctx;
            const { sourceUrl } = descriptor;
            const cfg = parseVectorAdapterConfig(descriptor.config);

            removeNativeLayerSource(map, layerId);

            map.addSource(layerId, {
                type: "vector",
                tiles: [sourceUrl],
                ...(cfg.maxzoom !== undefined ? { maxzoom: cfg.maxzoom } : {}),
            });

            const layerSpec = this._createLayerSpec(
                layerId,
                cfg.layerType,
                cfg,
            );

            map.addLayer(layerSpec);
        } catch (error) {
            logger.error(
                `VectorAdapter: Failed to add layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    removeFromMap(layerId: string, ctx: MapContext): void {
        try {
            removeNativeLayerSource(ctx.map, layerId);
        } catch (error) {
            logger.error(
                `VectorAdapter: Failed to remove layer "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    updateVisibility(layerId: string, visible: boolean, ctx: MapContext): void {
        try {
            setNativeVisibility(ctx.map, layerId, visible);
        } catch (error) {
            logger.error(
                `VectorAdapter: Failed to update visibility for "${layerId}"`,
                error,
            );
            throw error;
        }
    }

    updateConfig(renderUnit: RenderUnit, ctx: MapContext): void {
        try {
            const { map } = ctx;
            const layerId = renderUnit.id;
            const cfg = parseVectorAdapterConfig(
                renderUnit.descriptor.config,
            );

            if (!map.getLayer(layerId)) {
                this.addToMap(layerId, renderUnit.descriptor, ctx);
                return;
            }

            applyVectorPaint(map, layerId, cfg.layerType, cfg.paint);
        } catch (error) {
            logger.error(
                `VectorAdapter: Failed to update config for "${renderUnit.id}"`,
                error,
            );
            throw error;
        }
    }

    private _createLayerSpec(
        layerId: string,
        layerType: LayerType,
        config: VectorAdapterConfig,
    ): LayerSpecification {
        const paint = config.paint;
        const opacity = config.opacity;
        const spec = this._buildSpecByType(layerId, layerType, paint, opacity);
        const sourceLayer =
            typeof config.sourceLayer === "string" && config.sourceLayer
                ? config.sourceLayer
                : undefined;
        if (sourceLayer) {
            (spec as VectorLayerSpec)["source-layer"] = sourceLayer;
        }
        return spec;
    }

    private _buildSpecByType(
        layerId: string,
        layerType: LayerType,
        paint: Record<string, unknown>,
        opacity: number,
    ): LayerSpecification {
        switch (layerType) {
            case "fill":
                return createFillSpec(layerId, paint, opacity);
            case "line":
                return createLineSpec(layerId, paint, opacity);
            case "circle":
                return createCircleSpec(layerId, paint, opacity);
            case "symbol":
                return createSymbolSpec(layerId, paint, opacity);
        }
    }
}

function createFillSpec(
    layerId: string,
    paint: Record<string, unknown>,
    opacity: number,
): LayerSpecification {
    return {
        id: layerId,
        type: "fill",
        source: layerId,
        paint: {
            "fill-color": styleColor(paint["fill-color"], DEFAULT_ACCENT_CSS),
            "fill-opacity": styleNumber(paint["fill-opacity"], opacity),
        },
    };
}

function createLineSpec(
    layerId: string,
    paint: Record<string, unknown>,
    opacity: number,
): LayerSpecification {
    return {
        id: layerId,
        type: "line",
        source: layerId,
        paint: {
            "line-color": styleColor(paint["line-color"], DEFAULT_ACCENT_CSS),
            "line-width": styleNumber(paint["line-width"], DEFAULT_LINE_WIDTH_PX),
            "line-opacity": styleNumber(paint["line-opacity"], opacity),
        },
    };
}

function createCircleSpec(
    layerId: string,
    paint: Record<string, unknown>,
    opacity: number,
): LayerSpecification {
    return {
        id: layerId,
        type: "circle",
        source: layerId,
        paint: {
            "circle-color": styleColor(paint["circle-color"], DEFAULT_ACCENT_CSS),
            "circle-radius": styleNumber(
                paint["circle-radius"],
                DEFAULT_POINT_RADIUS_PX,
            ),
            "circle-opacity": styleNumber(paint["circle-opacity"], opacity),
        },
    };
}

function createSymbolSpec(
    layerId: string,
    paint: Record<string, unknown>,
    opacity: number,
): LayerSpecification {
    return {
        id: layerId,
        type: "symbol",
        source: layerId,
        layout: {
            "text-field": ["get", "name"],
            "text-size": DEFAULT_LABEL_TEXT_SIZE_PX,
        },
        paint: {
            "text-color": styleColor(paint["text-color"], DEFAULT_TEXT_CSS),
            "text-opacity": opacity,
        },
    };
}

function applyVectorPaint(
    map: import("maplibre-gl").Map,
    layerId: string,
    layerType: string,
    paint: Record<string, unknown>,
): void {
    const set = (prop: string, value: unknown): void => {
        if (value !== undefined) map.setPaintProperty(layerId, prop, value);
    };

    switch (layerType) {
        case "fill":
            set("fill-color", paint["fill-color"]);
            set("fill-opacity", paint["fill-opacity"]);
            break;
        case "line":
            set("line-color", paint["line-color"]);
            set("line-width", paint["line-width"]);
            set("line-opacity", paint["line-opacity"]);
            break;
        case "circle":
            set("circle-color", paint["circle-color"]);
            set("circle-radius", paint["circle-radius"]);
            set("circle-opacity", paint["circle-opacity"]);
            break;
        case "symbol":
            set("text-color", paint["text-color"]);
            set("text-opacity", paint["text-opacity"]);
            break;
    }
}
