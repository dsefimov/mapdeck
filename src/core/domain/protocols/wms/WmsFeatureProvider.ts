import { logger } from "@core/lib/logger";
import { fetchChecked } from "../shared/http";
import { buildWmsFeatureInfoUrl, wmsCrsKey } from "./url";
import { computeFeatureInfoPixel } from "./featureInfo";
import { parseFeature } from "../logic/parseFeature";
import type maplibregl from "maplibre-gl";
import type {
    LayerNode,
    FeatureProvider,
    Feature,
    CollectParams,
} from "@core/contracts";

/** A hung GetFeatureInfo endpoint must not freeze a map click. */
const FEATURE_INFO_TIMEOUT_MS = 10_000;

/**
 * Character cap of a raw-response excerpt — enough of a malformed body to
 * diagnose the failure in the UI. One cap for both the plain-text and the
 * pretty-printed-JSON branch.
 */
const RAW_EXCERPT_MAX_CHARS = 2000;

interface GetFeatureInfoParams {
    baseUrl: string;
    layers: string;
    version: string;
    screenX: number;
    screenY: number;
    map: maplibregl.Map;
    signal?: AbortSignal;
}

/** What a GetFeatureInfo response parsed into. */
type FeatureInfoOutcome =
    | { kind: "attributes"; attributes: Record<string, unknown> }
    | { kind: "html"; text: string }
    | { kind: "text"; text: string }
    | { kind: "raw"; excerpt: string };

/** Historical display keys for non-JSON responses, kept stable for the UI. */
function previewAttributes(
    outcome: Exclude<FeatureInfoOutcome, { kind: "attributes" }>,
): Record<string, unknown> {
    switch (outcome.kind) {
        case "html":
            return { htmlResponse: outcome.text };
        case "text":
            return { textResponse: outcome.text };
        case "raw":
            return { rawResponse: outcome.excerpt };
    }
}

/**
 * Feature provider for WMS layers.
 * Uses OGC GetFeatureInfo request to retrieve feature attributes.
 */
export class WmsFeatureProvider implements FeatureProvider {
    async collect(params: CollectParams): Promise<Feature[]> {
        const { screenX, screenY, map, visibleLayers, signal } = params;

        const results: Feature[] = [];

        for (const node of visibleLayers) {
            if (node.renderer.protocolId !== "wms") continue;
            if (signal?.aborted) break;
            const feature = await this.queryWmsLayer(node, {
                screenX,
                screenY,
                map,
                ...(signal ? { signal } : {}),
            });
            if (feature) results.push(feature);
        }

        return results;
    }

    private async queryWmsLayer(
        node: LayerNode,
        ctx: {
            screenX: number;
            screenY: number;
            map: maplibregl.Map;
            signal?: AbortSignal;
        },
    ): Promise<Feature | null> {
        try {
            const params = node.renderer.params;
            const outcome = await this.getFeatureInfo({
                baseUrl: node.renderer.sourceUrl,
                layers: this.getWmsLayerName(node),
                version: (params.version as string) ?? "1.3.0",
                screenX: ctx.screenX,
                screenY: ctx.screenY,
                map: ctx.map,
                ...(ctx.signal ? { signal: ctx.signal } : {}),
            });

            // Non-JSON responses surface as a preview attribute; an empty
            // attribute set means no feature at the clicked pixel.
            const attributes =
                outcome.kind === "attributes"
                    ? outcome.attributes
                    : previewAttributes(outcome);
            if (Object.keys(attributes).length === 0) {
                return null;
            }

            return {
                id: `${node.id}_wms`,
                layerId: node.id,
                layerName: node.title,
                attributes,
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
                attributes: {
                    error:
                        error instanceof Error
                            ? error.message
                            : "GetFeatureInfo failed",
                },
            };
        }
    }

    private getWmsLayerName(node: LayerNode): string {
        const layers = node.renderer.params.layers as string | undefined;
        return layers || node.title;
    }

    private async getFeatureInfo(
        params: GetFeatureInfoParams,
    ): Promise<FeatureInfoOutcome> {
        const url = this.buildRequestUrl(params);
        const response = await fetchChecked(url, {
            label: "GetFeatureInfo",
            signal: params.signal,
            timeoutMs: FEATURE_INFO_TIMEOUT_MS,
        });
        return this.parseResponse(response);
    }

    /**
     * Assembles the GetFeatureInfo request URL: map geometry to the pixel
     * and BBOX, versioned pixel/CRS parameters included.
     */
    private buildRequestUrl(params: GetFeatureInfoParams): string {
        const { baseUrl, layers, version, screenX, screenY, map } = params;

        const canvas = map.getCanvas();
        const center = map.getCenter();
        const ground = map.unproject([screenX, screenY]);
        const { x, y, bbox } = computeFeatureInfoPixel({
            center: { lng: center.lng, lat: center.lat },
            zoom: map.getZoom(),
            width: canvas.clientWidth,
            height: canvas.clientHeight,
            click: { lng: ground.lng, lat: ground.lat },
        });

        const parsedUrl = new URL(
            buildWmsFeatureInfoUrl(baseUrl, layers, { version }),
        );
        const q = parsedUrl.searchParams;
        q.set("WIDTH", String(canvas.clientWidth));
        q.set("HEIGHT", String(canvas.clientHeight));
        q.set(wmsCrsKey(version), "EPSG:3857");
        q.set("BBOX", `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`);
        // ≤1.1.x names the pixel X/Y, 1.3.0+ names it I/J — same policy as the CRS key.
        const pixelX = version.startsWith("1.1") || version.startsWith("1.0") ? "X" : "I";
        const pixelY = pixelX === "X" ? "Y" : "J";
        q.set(pixelX, String(x));
        q.set(pixelY, String(y));

        return parsedUrl.toString();
    }

    /** Content-type dispatch of a GetFeatureInfo response. */
    private async parseResponse(
        response: Response,
    ): Promise<FeatureInfoOutcome> {
        const contentType = response.headers.get("content-type") ?? "";

        if (contentType.includes("application/json")) {
            return this.parseJsonResponse(await response.json());
        }
        if (contentType.includes("text/html")) {
            return { kind: "html", text: await response.text() };
        }
        if (contentType.includes("text/plain")) {
            return { kind: "text", text: await response.text() };
        }

        const text = await response.text();
        try {
            return this.parseJsonResponse(JSON.parse(text));
        } catch {
            return {
                kind: "raw",
                excerpt: text.substring(0, RAW_EXCERPT_MAX_CHARS),
            };
        }
    }

    /** JSON responses yield attributes, an empty set, or a raw excerpt. */
    private parseJsonResponse(json: unknown): FeatureInfoOutcome {
        if (json && typeof json === "object" && "features" in json) {
            const data = json as Record<string, unknown>;
            const features = data.features as Array<Record<string, unknown>>;

            // A pixel query hits the topmost feature; the panel shows one
            // feature per layer — stacking all hits' properties into one
            // record (the old Object.assign) silently corrupted it.
            if (Array.isArray(features)) {
                const first = features[0];
                const parsed = first ? parseFeature(first) : null;
                if (parsed) {
                    return { kind: "attributes", attributes: parsed.properties };
                }
            }
            return { kind: "attributes", attributes: {} };
        }

        return {
            kind: "raw",
            excerpt: JSON.stringify(json, null, 2).substring(
                0,
                RAW_EXCERPT_MAX_CHARS,
            ),
        };
    }
}
