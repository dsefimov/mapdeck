import type {
    LayerAdapter,
    LayerStyle,
    RenderDescriptor,
} from "@core/contracts";
import { ColorScheme } from "@core/contracts";
import type { Protocol } from "@core/contracts";
import { resolveStyle } from "../logic/resolveStyle";
import { styleNumber } from "../logic/styleValues";
import { COPC_PROTOCOL_ID } from "./types";
import { resolveColorScheme } from "./logic/colorScheme";
import { PointCloudAdapter } from "./adapter";

/** Render config for a COPC layer — style-derived, consumed by the point-cloud adapter. */
type CopcConfig = {
    type: "copc";
    url: string;
    pointSize?: number;
    colorScheme?: ColorScheme;
    opacity?: number;
};

/** Protocol for COPC point clouds: translates a layer style into a {@link CopcConfig}. */
export class CopcProtocol implements Protocol<CopcConfig> {
    readonly id = COPC_PROTOCOL_ID;
    readonly label = "COPC Point Cloud";
    readonly defaultStyle: LayerStyle = {
        paint: { "circle-radius": 2, "circle-opacity": 1 },
        metadata: { colorScheme: ColorScheme.RGB },
    };
    private readonly adapter: PointCloudAdapter;

    /** @param lazPerfWasmUrl - deployment-tunable decoder location. */
    constructor(lazPerfWasmUrl = "laz-perf.wasm") {
        this.adapter = new PointCloudAdapter(lazPerfWasmUrl);
    }
    getLayerAdapter(): LayerAdapter {
        return this.adapter;
    }
    createRenderDescriptor(
        sourceUrl: string,
        style?: LayerStyle,
        _p: Record<string, unknown> = {},
    ): RenderDescriptor<CopcConfig> {
        const mergedStyle = resolveStyle(this.defaultStyle, style);
        return {
            sourceUrl,
            config: {
                type: "copc",
                url: sourceUrl,
                pointSize: styleNumber(
                    mergedStyle.paint?.["circle-radius"],
                    2,
                ),
                colorScheme: resolveColorScheme(
                    mergedStyle.metadata?.colorScheme,
                ),
                opacity: styleNumber(
                    mergedStyle.paint?.["circle-opacity"],
                    1.0,
                ),
            },
        };
    }
}
