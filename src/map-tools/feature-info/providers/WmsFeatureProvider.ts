import { logger } from "@core/shared/diagnostics/logger";
import {
    parseWmsUrl,
    getWmsLayerName,
    buildWmsFeatureInfoUrl,
} from "@core/shared/protocols/ogc/wms";
import { parseFeature } from "@core/shared/protocols/ogc/wfs/parser";
import type maplibregl from "maplibre-gl";
import type { FeatureProvider, Feature, CollectParams } from "../types";
import {
    isRasterConfig,
    type LayerNode,
    type RasterLayerConfig,
} from "@core/framework/types";

interface WmsLayerInfo {
    node: LayerNode;
    config: RasterLayerConfig;
}

interface GetFeatureInfoParams {
    baseUrl: string;
    layers: string;
    version: string;
    screenX: number;
    screenY: number;
    map: maplibregl.Map;
    signal?: AbortSignal;
}

/**
 * Feature provider for WMS layers.
 * Uses OGC GetFeatureInfo request to retrieve feature attributes.
 */
export class WmsFeatureProvider implements FeatureProvider {
    async collect(params: CollectParams): Promise<Feature[]> {
        const {
            screenX,
            screenY,
            map,
            visibleLayers,
            signal,
            xyzNotAvailableMessage,
            cogNotAvailableMessage,
        } = params;

        const wmsLayers = this.getWmsLayers(visibleLayers);
        const xyzLayers = this.getRasterLayers(visibleLayers, "xyz");
        const cogLayers = this.getRasterLayers(visibleLayers, "cog");

        const results: Feature[] = [];

        // Query each WMS layer
        for (const layerInfo of wmsLayers) {
            if (signal?.aborted) break;
            const feature = await this.queryWmsLayer(layerInfo, {
                screenX,
                screenY,
                map,
                ...(signal ? { signal } : {}),
            });
            if (feature) results.push(feature);
        }

        // XYZ placeholder
        for (const { node } of xyzLayers) {
            results.push({
                id: `${node.id}_xyz`,
                layerId: node.id,
                layerName: node.title,
                sourceType: "wms",
                attributes: { info: xyzNotAvailableMessage ?? "" },
                groupId: node.id,
            });
        }

        // COG placeholder
        for (const { node } of cogLayers) {
            results.push({
                id: `${node.id}_cog`,
                layerId: node.id,
                layerName: node.title,
                sourceType: "wms",
                attributes: { info: cogNotAvailableMessage ?? "" },
                groupId: node.id,
            });
        }

        return results;
    }

    /**
     * Query a single WMS layer for feature info.
     * Returns a Feature if found, null otherwise.
     */
    private async queryWmsLayer(
        layerInfo: WmsLayerInfo,
        ctx: {
            screenX: number;
            screenY: number;
            map: maplibregl.Map;
            signal?: AbortSignal;
        },
    ): Promise<Feature | null> {
        const { node, config } = layerInfo;
        try {
            const baseUrl = parseWmsUrl(config.url).baseUrl;
            const attributes = await this.getFeatureInfo({
                baseUrl,
                layers: this.getWmsLayerName(config, node),
                version: config.version ?? "1.3.0",
                screenX: ctx.screenX,
                screenY: ctx.screenY,
                map: ctx.map,
                ...(ctx.signal ? { signal: ctx.signal } : {}),
            });

            if (this.isEmptyResponse(attributes)) {
                return null;
            }

            return {
                id: `${node.id}_wms`,
                layerId: node.id,
                layerName: node.title,
                sourceType: "wms",
                attributes,
                groupId: node.id,
            };
        } catch (error) {
            logger.error(
                `WmsFeatureProvider: GetFeatureInfo failed for layer "${node.id}"`,
                error,
            );
            return {
                id: `${node.id}_wms`,
                layerId: node.id,
                layerName: node.title,
                sourceType: "wms",
                attributes: {
                    error:
                        error instanceof Error
                            ? error.message
                            : "GetFeatureInfo failed",
                },
                groupId: node.id,
            };
        }
    }

    private getWmsLayerName(
        config: RasterLayerConfig,
        node: LayerNode,
    ): string {
        return getWmsLayerName(config.url, config.layers) || node.title;
    }

    private getWmsLayers(visibleLayers: LayerNode[]): WmsLayerInfo[] {
        const result: WmsLayerInfo[] = [];
        for (const node of visibleLayers) {
            const config = node.roles.display.render.config;
            if (isRasterConfig(config) && config.type === "wms") {
                result.push({ node, config });
            }
        }
        return result;
    }

    /**
     * Filter visible layers to get raster layers of a specific type.
     */
    private getRasterLayers(
        visibleLayers: LayerNode[],
        type: "xyz" | "cog",
    ): WmsLayerInfo[] {
        const result: WmsLayerInfo[] = [];
        for (const node of visibleLayers) {
            const config = node.roles.display.render.config;
            if (isRasterConfig(config) && config.type === type) {
                result.push({ node, config });
            }
        }
        return result;
    }

    private async getFeatureInfo(
        params: GetFeatureInfoParams,
    ): Promise<Record<string, unknown>> {
        const { baseUrl, layers, version, screenX, screenY, map } = params;

        const bounds = map.getBounds();
        const canvas = map.getCanvas();

        const baseUrlStr = buildWmsFeatureInfoUrl(baseUrl, layers, { version });

        const parsedUrl = new URL(baseUrlStr);
        const queryParams = parsedUrl.searchParams;
        queryParams.set("I", String(screenX));
        queryParams.set("J", String(screenY));
        queryParams.set("WIDTH", String(canvas.clientWidth));
        queryParams.set("HEIGHT", String(canvas.clientHeight));
        queryParams.set(
            "BBOX",
            `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`,
        );
        queryParams.set("CRS", "EPSG:4326");

        const url = parsedUrl.toString();

        const fetchInit: RequestInit = params.signal
            ? { signal: params.signal }
            : {};
        const response = await globalThis.fetch(url, fetchInit);

        if (!response.ok) {
            throw new Error(
                `GetFeatureInfo returned ${response.status} ${response.statusText}`,
            );
        }

        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
            return this.parseJsonResponse(await response.json());
        }

        if (contentType.includes("text/html")) {
            const text = await response.text();
            return { htmlResponse: text };
        }

        if (contentType.includes("text/plain")) {
            const text = await response.text();
            return { textResponse: text };
        }

        // Fallback: try JSON, then text
        try {
            const json = await response.json();
            return this.parseJsonResponse(json);
        } catch {
            const text = await response.text();
            return { rawResponse: text.substring(0, 1000) };
        }
    }

    /**
     * Parse WMS JSON response into a flat attributes object.
     */
    private parseJsonResponse(json: unknown): Record<string, unknown> {
        const attrs: Record<string, unknown> = {};

        if (json && typeof json === "object" && "features" in json) {
            const data = json as Record<string, unknown>;
            const features = data.features as Array<Record<string, unknown>>;

            if (Array.isArray(features) && features.length > 0) {
                for (const feature of features) {
                    const parsed = parseFeature(feature);
                    if (parsed) {
                        Object.assign(attrs, parsed.properties);
                    }
                }
            } else {
                attrs.noFeatures = "No features found in WMS response";
            }
        } else {
            attrs.rawJson = JSON.stringify(json, null, 2).substring(0, 2000);
        }

        return attrs;
    }

    /**
     * Check if the response attributes indicate no features were found.
     */
    private isEmptyResponse(attributes: Record<string, unknown>): boolean {
        return (
            "noFeatures" in attributes || Object.keys(attributes).length === 0
        );
    }
}
