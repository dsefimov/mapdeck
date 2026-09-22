import type {
    LayerAdapter,
    LayerStyle,
    RenderDescriptor,
    RenderUnit,
} from "@core/contracts";
import type { Protocol } from "@core/contracts";
import { resolveStyle } from "../logic/resolveStyle";
import { styleNumber } from "../logic/styleValues";
import { RasterAdapter } from "../shared";
import { groupVisibleWmsNodes, type WmsGroupInput } from "./grouper";
import type { WmsGroupConfig } from "./types";
import { buildWmsTileUrl } from "./url";

type WmsConfig = {
    type: "wms";
    /** Clean endpoint URL — request parameters live in params, never in here. */
    url: string;
    layers?: string | undefined;
    styles?: string | undefined;
    version: string;
    format?: string | undefined;
    opacity: number;
};

export class WmsProtocol implements Protocol<WmsConfig> {
    readonly id = "wms";
    readonly label = "WMS";
    readonly defaultStyle: LayerStyle = { paint: { "raster-opacity": 1 } };
    private readonly adapter = new RasterAdapter();

    getLayerAdapter(): LayerAdapter {
        return this.adapter;
    }

    createRenderDescriptor(
        sourceUrl: string,
        style?: LayerStyle,
        params: Record<string, unknown> = {},
    ): RenderDescriptor<WmsConfig> {
        const mergedStyle = resolveStyle(this.defaultStyle, style);
        const wp = readWmsParams(params);
        return {
            sourceUrl: buildWmsTileUrl(sourceUrl, wp.layers ?? "", {
                version: wp.version,
                format: wp.format,
                styles: wp.styles,
            }),
            config: {
                type: "wms",
                url: sourceUrl,
                layers: wp.layers,
                styles: wp.styles,
                version: wp.version,
                format: wp.format,
                opacity: styleNumber(
                    mergedStyle.paint?.["raster-opacity"],
                    1.0,
                ),
            },
        };
    }

    groupRenderUnits(renderUnits: Map<string, RenderUnit>): void {
        const wmsUnits: WmsGroupInput[] = [];
        for (const [id, unit] of renderUnits) {
            if (unit.protocolId !== "wms") continue;
            wmsUnits.push({ id, descriptor: unit.descriptor });
        }
        if (wmsUnits.length === 0) return;
        const groups = groupVisibleWmsNodes(wmsUnits);
        for (const input of wmsUnits) renderUnits.delete(input.id);
        for (const group of groups) {
            renderUnits.set(
                group.groupId,
                this.buildGroupRenderUnit(group, wmsUnits),
            );
        }
    }

    private buildGroupRenderUnit(
        group: WmsGroupConfig,
        wmsInputs: WmsGroupInput[],
    ): RenderUnit {
        const { layerNames, styleNames } = collectLayerInfo(
            group.nodeIds,
            wmsInputs,
        );
        const tileUrl = buildWmsTileUrl(group.baseUrl, layerNames.join(","), {
            version: group.version,
            format: group.format,
            styles: styleNames.join(","),
        });
        return {
            id: group.groupId,
            nodeIds: group.nodeIds,
            protocolId: "wms",
            adapter: this.adapter,
            descriptor: {
                sourceUrl: tileUrl,
                config: {
                    type: "wms",
                    url: group.baseUrl,
                    opacity: group.opacity,
                },
            },
        };
    }
}

function readWmsParams(params: Record<string, unknown>): {
    layers: string | undefined;
    styles: string | undefined;
    version: string;
    format: string | undefined;
} {
    const str = (key: string): string | undefined => {
        const value = params[key];
        return typeof value === "string" && value ? value : undefined;
    };
    return {
        layers: str("layers"),
        styles: str("styles"),
        version: str("version") ?? "1.3.0",
        format: str("format"),
    };
}

function collectLayerInfo(
    nodeIds: string[],
    wmsInputs: WmsGroupInput[],
): { layerNames: string[]; styleNames: string[] } {
    const layerNames: string[] = [];
    const styleNames: string[] = [];
    for (const nid of [...nodeIds].reverse()) {
        const input = wmsInputs.find((i) => i.id === nid);
        if (!input) continue;
        // Group descriptors are built by this protocol — its own config
        // keys are the only contract it reads back.
        const cfg = input.descriptor.config;
        if (typeof cfg.layers === "string" && cfg.layers) {
            layerNames.push(cfg.layers);
        }
        if (typeof cfg.styles === "string" && cfg.styles) {
            styleNames.push(cfg.styles);
        }
    }
    return { layerNames, styleNames };
}
