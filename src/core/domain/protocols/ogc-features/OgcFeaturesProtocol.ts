import type {
    LayerAdapter,
    LayerStyle,
    RenderDescriptor,
    ProtocolBinding,
    AttributeFetchRequest,
    AttributeFetchResult,
    AttributeAdapter,
} from "@core/contracts";
import type { Protocol } from "@core/contracts";
import { resolveStyle } from "../logic/resolveStyle";
import { styleNumber } from "../logic/styleValues";
import { GeoJsonAdapter } from "../shared";

type OgcFeaturesConfig = {
    type: "ogc-features";
    url: string;
    layerType?: "fill" | "line" | "circle";
    paint?: Record<string, unknown>;
    opacity?: number;
}

export class OgcFeaturesProtocol implements Protocol<OgcFeaturesConfig> {
    readonly id = "ogc-features";
    readonly label = "OGC API Features";
    readonly defaultStyle: LayerStyle = {
        type: "fill",
        paint: { "fill-opacity": 1 },
    };
    private readonly adapter = new GeoJsonAdapter();
    private readonly attrAdapter: AttributeAdapter;

    constructor(attrAdapter: AttributeAdapter) {
        this.attrAdapter = attrAdapter;
    }

    getLayerAdapter(): LayerAdapter {
        return this.adapter;
    }

    createRenderDescriptor(
        sourceUrl: string,
        style?: LayerStyle,
        _p: Record<string, unknown> = {},
    ): RenderDescriptor<OgcFeaturesConfig> {
        const mergedStyle = resolveStyle(this.defaultStyle, style);
        return {
            sourceUrl,
            config: {
                type: "ogc-features",
                url: sourceUrl,
                layerType:
                    (mergedStyle.type as OgcFeaturesConfig["layerType"]) ??
                    "fill",
                paint: mergedStyle.paint ?? {},
                opacity: styleNumber(
                    mergedStyle.paint?.["fill-opacity"],
                    1.0,
                ),
            },
        };
    }

    async fetchAttributes(
        binding: ProtocolBinding,
        request: AttributeFetchRequest,
        signal?: AbortSignal,
    ): Promise<AttributeFetchResult> {
        return this.attrAdapter.fetchAttributes(binding, request, signal);
    }
}
