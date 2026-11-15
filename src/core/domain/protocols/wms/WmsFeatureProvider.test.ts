import { afterEach, describe, expect, it, vi } from "vitest";
import type maplibregl from "maplibre-gl";
import type { CollectParams, LayerNode } from "@core/contracts";
import { WmsFeatureProvider } from "./WmsFeatureProvider";

function wmsNode(): LayerNode {
    return {
        id: "L1",
        title: "Roads",
        renderer: {
            protocolId: "wms",
            sourceUrl: "https://wms.example.com/service",
            params: { layers: "roads" },
        },
    } as unknown as LayerNode;
}

function mapStub(): maplibregl.Map {
    return {
        getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
        getCenter: () => ({ lng: 30.3, lat: 59.9 }),
        getZoom: () => 8,
        unproject: () => ({ lng: 30.3, lat: 59.9 }),
    } as unknown as maplibregl.Map;
}

/** Response-like stub whose body can be read exactly once, like real fetch. */
/** Response-like stub whose body reads exactly once, like real fetch:
 *  json() consumes the stream even when parsing fails. */
function respondWith(
    contentType: string,
    body: string,
): ReturnType<typeof vi.fn> {
    let consumed = false;
    return vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => contentType },
        json: async () => {
            if (consumed) throw new TypeError("body stream already read");
            consumed = true;
            throw new SyntaxError("Unexpected token '<' is not valid JSON");
        },
        text: async () => {
            if (consumed) throw new TypeError("body stream already read");
            consumed = true;
            return body;
        },
    }));
}

async function collectWith(): Promise<ReturnType<typeof WmsFeatureProvider.prototype.collect>> {
    const provider = new WmsFeatureProvider();
    const params = {
        screenX: 400,
        screenY: 300,
        map: mapStub(),
        visibleLayers: [wmsNode()],
    } as CollectParams;
    return provider.collect(params);
}

describe("WmsFeatureProvider GetFeatureInfo body handling", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("extracts a raw preview when a non-JSON payload arrives untyped", async () => {
        const fetchMock = respondWith("application/xml", "<ServiceException/>");
        vi.stubGlobal("fetch", fetchMock);

        const [feature] = await collectWith();

        expect(feature?.attributes.rawResponse).toContain("ServiceException");
    });

    it("reads the body exactly once", async () => {
        const fetchMock = respondWith("", "{}");
        vi.stubGlobal("fetch", fetchMock);

        await collectWith();

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("still parses JSON arriving under an unexpected content-type", async () => {
        const fetchMock = respondWith(
            "",
            '{"features":[{"properties":{"name":"M-8"}}]}',
        );
        vi.stubGlobal("fetch", fetchMock);

        const [feature] = await collectWith();

        expect(feature?.attributes.name).toBe("M-8");
    });

    it("a stacked multi-feature answer yields the topmost feature only", async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: "OK",
            headers: { get: () => "application/json" },
            json: async () => ({
                features: [
                    { properties: { name: "top" } },
                    { properties: { name: "bottom", extra: 1 } },
                ],
            }),
            text: async () => "",
        }));
        vi.stubGlobal("fetch", fetchMock);

        const [feature] = await collectWith();

        expect(feature?.attributes).toEqual({ name: "top" });
    });
});
