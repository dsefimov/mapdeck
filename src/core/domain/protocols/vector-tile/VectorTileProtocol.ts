import type {
    LayerAdapter,
    LayerStyle,
    RenderDescriptor,
} from "@core/contracts";
import type { Protocol } from "@core/contracts";
import { resolveStyle } from "../logic/resolveStyle";
import { styleNumber } from "../logic/styleValues";
import { VectorAdapter } from "../shared";

type VectorTileConfig = {
    type: "vector-tile";
    url: string;
    layerType?: "fill" | "line" | "circle" | "symbol";
    /** MVT source layer name — required by MapLibre to style a vector source. */
    sourceLayer?: string;
    /** Tile pyramid top level — MapLibre overzooms parent tiles beyond it. */
    maxzoom?: number;
    paint?: Record<string, unknown>;
    opacity?: number;
};

export class VectorTileProtocol implements Protocol<VectorTileConfig> {
    readonly id = "vector-tile";
    readonly label = "Vector Tiles";
    readonly defaultStyle: LayerStyle = {
        type: "fill",
        paint: { "fill-opacity": 1 },
    };
    private readonly adapter = new VectorAdapter();
    getLayerAdapter(): LayerAdapter {
        return this.adapter;
    }
    createRenderDescriptor(
        sourceUrl: string,
        style?: LayerStyle,
        params: Record<string, unknown> = {},
    ): RenderDescriptor<VectorTileConfig> {
        const mergedStyle = resolveStyle(this.defaultStyle, style);
        const sourceLayer = strOrUndefined(params.sourceLayer);
        const maxzoom = positiveNumberOrUndefined(params.maxzoom);
        return {
            sourceUrl,
            config: {
                type: "vector-tile",
                url: sourceUrl,
                layerType: resolveLayerType(style, params),
                ...(sourceLayer ? { sourceLayer } : {}),
                ...(maxzoom ? { maxzoom } : {}),
                paint: mergedStyle.paint ?? {},
                opacity: styleOpacity(mergedStyle.paint),
            },
        };
    }
}

function strOrUndefined(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}

function positiveNumberOrUndefined(value: unknown): number | undefined {
    return typeof value === "number" && value > 0 ? value : undefined;
}

function resolveLayerType(
    style: LayerStyle | undefined,
    params: Record<string, unknown>,
): NonNullable<VectorTileConfig["layerType"]> {
    return (
        (style?.type as VectorTileConfig["layerType"]) ??
        layerTypeOrUndefined(params.layerType) ??
        "fill"
    );
}

function styleOpacity(paint: Record<string, unknown> | undefined): number {
    return styleNumber(paint?.["fill-opacity"], 1.0);
}

function layerTypeOrUndefined(
    value: unknown,
): VectorTileConfig["layerType"] | undefined {
    const allowed = ["fill", "line", "circle", "symbol"] as const;
    return allowed.includes(value as (typeof allowed)[number])
        ? (value as VectorTileConfig["layerType"])
        : undefined;
}
