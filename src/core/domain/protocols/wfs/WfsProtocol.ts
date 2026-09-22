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
import { GeoJsonAdapter } from "../shared";

type WfsConfig = {
    type: "wfs";
    url: string;
    typename?: string;
    version?: string;
};

export class WfsProtocol implements Protocol<WfsConfig> {
    readonly id = "wfs";
    readonly label = "WFS";
    /** Attribute protocol — the STAC module decides which slots it serves. */
    readonly defaultStyle: LayerStyle = {};
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
        _style?: LayerStyle,
        _p: Record<string, unknown> = {},
    ): RenderDescriptor<WfsConfig> {
        return { sourceUrl, config: { type: "wfs", url: sourceUrl } };
    }

    async fetchAttributes(
        binding: ProtocolBinding,
        request: AttributeFetchRequest,
        signal?: AbortSignal,
    ): Promise<AttributeFetchResult> {
        return this.attrAdapter.fetchAttributes(binding, request, signal);
    }
}
