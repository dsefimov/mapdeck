import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { GroupNode, LayerNode } from "@core/contracts";
import { STACTreeAdapter } from "./STACTreeAdapter";
import { AssetProtocolMapper } from "@core/domain/protocols";
import { ReportRoleResolver } from "../roles/resolvers/ReportRoleResolver";
import { AttributeRoleResolver } from "../roles/resolvers/AttributeRoleResolver";
import { PointCloudRoleResolver } from "../roles/resolvers/PointCloudRoleResolver";
import { RasterTileRoleResolver } from "../roles/resolvers/RasterTileRoleResolver";
import { WmsRoleResolver } from "../roles/resolvers/WmsRoleResolver";
import { VectorTileRoleResolver } from "../roles/resolvers/VectorTileRoleResolver";
import { GeoJsonRoleResolver } from "../roles/resolvers/GeoJsonRoleResolver";
import type { CapabilitySource } from "../mapping/capabilities";
import { ProtocolRegistry } from "@core/domain/protocols/stores/ProtocolRegistry";
import { createXyzProtocol } from "@core/domain/protocols/xyz/XyzProtocol";
import { VectorTileProtocol } from "@core/domain/protocols/vector-tile/VectorTileProtocol";
import { CopcProtocol } from "@core/domain/protocols/copc/CopcProtocol";
import { resolveRenderer } from "@core/domain/layer-tree";

const PUBLIC_DIR = resolve(process.cwd(), "public");
const CATALOG_URL = "http://localhost/catalog.json";

/**
 * Serves the committed demo catalog from public/ as if it were the app
 * origin — the same URL shapes the browser resolves against localhost.
 */
function localFileFetch(input: string | URL | Request): Promise<Response> {
    const url = new URL(input.toString(), "http://localhost");
    const file = resolve(PUBLIC_DIR, url.pathname.replace(/^\/+/, ""));
    try {
        return Promise.resolve(
            new Response(readFileSync(file, "utf8"), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        );
    } catch {
        return Promise.resolve(new Response("not found", { status: 404 }));
    }
}

/** Mirrors the production tool links (registerTools) for the demo protocols. */
const capabilityLinks: Record<string, string[]> = {
    "xyz|renderer": ["raster-opacity"],
    "vector-tile|renderer": ["vector-color-picker"],
    copc: ["point-size-slider", "point-color-scheme"],
};

const capabilitySource: CapabilitySource = {
    linkedToolIds(protocolId, slot) {
        return capabilityLinks[`${protocolId}|${slot}`] ?? capabilityLinks[protocolId] ?? [];
    },
    hasLink(protocolId, slot, toolId) {
        return this.linkedToolIds(protocolId, slot).includes(toolId);
    },
};

function buildAdapter(): STACTreeAdapter {
    const mapper = new AssetProtocolMapper();
    mapper.registerRule(new ReportRoleResolver());
    mapper.registerRule(new AttributeRoleResolver());
    mapper.registerRule(new PointCloudRoleResolver());
    mapper.registerRule(new WmsRoleResolver());
    mapper.registerRule(new VectorTileRoleResolver());
    mapper.registerRule(new GeoJsonRoleResolver());
    mapper.registerRule(new RasterTileRoleResolver());
    return new STACTreeAdapter(mapper, capabilitySource);
}

function layersOf(nodes: Awaited<ReturnType<STACTreeAdapter["fetchChildren"]>>): LayerNode[] {
    return nodes.filter((n): n is LayerNode => "renderer" in n);
}

describe("demo catalog (public/) end-to-end", () => {
    beforeAll(() => {
        vi.stubGlobal("fetch", vi.fn(localFileFetch));
    });

    it("root exposes the three demo collections", async () => {
        const adapter = buildAdapter();
        adapter.initialize({ url: CATALOG_URL });
        const groups = (await adapter.fetchRoot()) as GroupNode[];

        expect(groups.map((g) => g.title)).toEqual([
            "Raster — Esri",
            "Vector — MapLibre Demotiles",
            "Point Cloud — Autzen COPC",
        ]);
    });

    it("raster items resolve to xyz with capabilities and a render descriptor", async () => {
        const adapter = buildAdapter();
        adapter.initialize({ url: CATALOG_URL });
        const groups = (await adapter.fetchRoot()) as GroupNode[];
        const children = await adapter.fetchChildren(groups[0]!);

        expect(children).toHaveLength(2);
        const maxzooms: number[] = [];
        for (const layer of layersOf(children)) {
            expect(layer.renderer.protocolId).toBe("xyz");
            expect(layer.renderer.sourceUrl).toMatch(
                /^https:\/\/server\.arcgisonline\.com\/ArcGIS\/rest\/services\/.*\/MapServer\/tile\/\{z\}\/\{y\}\/\{x\}$/,
            );
            expect(layer.capabilities.map((c) => c.toolId)).toEqual([
                "raster-opacity",
            ]);
            maxzooms.push(layer.renderer.params.maxzoom as number);
        }
        expect(maxzooms).toEqual([8, 13]);
    });

    it("vector items carry source layer, type and vector tool capability", async () => {
        const adapter = buildAdapter();
        adapter.initialize({ url: CATALOG_URL });
        const groups = (await adapter.fetchRoot()) as GroupNode[];
        const children = await adapter.fetchChildren(groups[1]!);
        const layers = layersOf(children);

        expect(layers).toHaveLength(3);
        const byLayer = new Map(
            layers.map((l) => [l.renderer.params.sourceLayer, l]),
        );
        expect(byLayer.get("countries")!.renderer.params.layerType).toBe("fill");
        expect(byLayer.get("geolines")!.renderer.params.layerType).toBe("line");
        expect(byLayer.get("centroids")!.renderer.params.layerType).toBe(
            "circle",
        );
        for (const layer of layers) {
            expect(layer.renderer.sourceUrl).toBe(
                "https://demotiles.maplibre.org/tiles/{z}/{x}/{y}.pbf",
            );
            expect(layer.renderer.params.maxzoom).toBe(6);
            expect(layer.capabilities.map((c) => c.toolId)).toEqual([
                "vector-color-picker",
            ]);
        }
    });

    it("point cloud item resolves to copc with viewport origin from bbox", async () => {
        const adapter = buildAdapter();
        adapter.initialize({ url: CATALOG_URL });
        const groups = (await adapter.fetchRoot()) as GroupNode[];
        const children = await adapter.fetchChildren(groups[2]!);
        const layer = layersOf(children)[0]!;

        expect(children).toHaveLength(1);
        expect(layer.renderer.protocolId).toBe("copc");
        expect(layer.renderer.sourceUrl).toBe(
            "https://hobu-lidar.s3.amazonaws.com/autzen-classified.copc.laz",
        );
        const origin = layer.renderer.params.coordinateOrigin as number[];
        expect(origin[0]).toBeCloseTo(-123.066, 2);
        expect(origin[1]).toBeCloseTo(44.056, 2);
        expect(layer.capabilities.map((c) => c.toolId)).toEqual([
            "point-size-slider",
            "point-color-scheme",
        ]);
    });

    it("every demo layer passes the core renderability gate", async () => {
        const registry = new ProtocolRegistry();
        registry.register(createXyzProtocol());
        registry.register(new VectorTileProtocol());
        registry.register(new CopcProtocol());

        const adapter = buildAdapter();
        adapter.initialize({ url: CATALOG_URL });
        const groups = (await adapter.fetchRoot()) as GroupNode[];

        for (const group of groups) {
            for (const layer of layersOf(await adapter.fetchChildren(group))) {
                const resolution = resolveRenderer(layer, registry);
                expect(resolution.renderable).toBe(true);
            }
        }
    });

    it("vector descriptors keep the source layer for the MapLibre spec", async () => {
        const registry = new ProtocolRegistry();
        registry.register(new VectorTileProtocol());

        const adapter = buildAdapter();
        adapter.initialize({ url: CATALOG_URL });
        const groups = (await adapter.fetchRoot()) as GroupNode[];
        const countries = layersOf(await adapter.fetchChildren(groups[1]!)).find(
            (l) => l.renderer.params.sourceLayer === "countries",
        )!;
        const resolution = resolveRenderer(countries, registry);
        expect(resolution.renderable).toBe(true);
        if (resolution.renderable) {
            expect(resolution.descriptor.config.sourceLayer).toBe("countries");
            expect(resolution.descriptor.config.layerType).toBe("fill");
        }
    });
});

describe("extension rules over the kernel mapper (end-to-end)", () => {
    const POINT_CLOUD_ROLE = "point-cloud";
    const CONSUMER_PROTOCOL_ID = "consumer-pc";

    /** The built-in rule set plus a consumer rule claiming point clouds. */
    function adapterWithCustomCloud(
        fitness: number | null,
    ): STACTreeAdapter {
        const mapper = new AssetProtocolMapper();
        mapper.registerRule(new ReportRoleResolver());
        mapper.registerRule(new AttributeRoleResolver());
        mapper.registerRule(new RasterTileRoleResolver());
        mapper.registerRule(new WmsRoleResolver());
        mapper.registerRule(new VectorTileRoleResolver());
        mapper.registerRule(new GeoJsonRoleResolver());
        mapper.registerRule(new PointCloudRoleResolver());
        mapper.registerRule({
            priority: 5,
            canResolve: (asset) =>
                asset.roles?.includes(POINT_CLOUD_ROLE) ?? false,
            resolve: (asset) => ({
                protocolId: CONSUMER_PROTOCOL_ID,
                sourceUrl: asset.href,
                params: {},
            }),
        });
        if (fitness !== null) {
            mapper.registerSlots(CONSUMER_PROTOCOL_ID, { renderer: fitness });
        }
        return new STACTreeAdapter(mapper, capabilitySource);
    }

    async function cloudLayer(adapter: STACTreeAdapter): Promise<LayerNode> {
        adapter.initialize({ url: CATALOG_URL });
        const groups = (await adapter.fetchRoot()) as GroupNode[];
        return layersOf(await adapter.fetchChildren(groups[2]!))[0]!;
    }

    it("a consumer rule with slot registration steers the item", async () => {
        const layer = await cloudLayer(adapterWithCustomCloud(95));

        expect(layer.renderer.protocolId).toBe(CONSUMER_PROTOCOL_ID);
        expect(layer.renderer.sourceUrl).toBe(
            "https://hobu-lidar.s3.amazonaws.com/autzen-classified.copc.laz",
        );
    });

    it("a rule without slot registration renders no layer", async () => {
        const adapter = adapterWithCustomCloud(null);

        adapter.initialize({ url: CATALOG_URL });
        const groups = (await adapter.fetchRoot()) as GroupNode[];
        const children = await adapter.fetchChildren(groups[2]!);

        expect(layersOf(children)).toHaveLength(0);
    });
});
