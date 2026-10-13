import { describe, it, expect } from "vitest";
import type { STACAsset } from "../types";
import { AssetProtocolMapper } from "@core/domain/protocols";
import { ReportRoleResolver } from "../roles/resolvers/ReportRoleResolver";
import { AttributeRoleResolver } from "../roles/resolvers/AttributeRoleResolver";
import { PointCloudRoleResolver } from "../roles/resolvers/PointCloudRoleResolver";
import { RasterTileRoleResolver } from "../roles/resolvers/RasterTileRoleResolver";
import { WmsRoleResolver } from "../roles/resolvers/WmsRoleResolver";
import { VectorTileRoleResolver } from "../roles/resolvers/VectorTileRoleResolver";
import { GeoJsonRoleResolver } from "../roles/resolvers/GeoJsonRoleResolver";

const OGC_PROTOCOL_ID = "ogc-features";
const MVT_PROTOCOL_ID = "vector-tile";

const asset = (overrides: Partial<STACAsset>): STACAsset => ({
    href: "https://example.test/data",
    ...overrides,
});

/** The module's real rule chain over the kernel mapper's default slots. */
function mapper(): AssetProtocolMapper {
    const m = new AssetProtocolMapper();
    m.registerRule(new ReportRoleResolver());
    m.registerRule(new AttributeRoleResolver());
    m.registerRule(new RasterTileRoleResolver());
    m.registerRule(new WmsRoleResolver());
    m.registerRule(new VectorTileRoleResolver());
    m.registerRule(new GeoJsonRoleResolver());
    m.registerRule(new PointCloudRoleResolver());
    return m;
}

function map(assets: Record<string, STACAsset>) {
    return mapper().mapAssets(assets);
}

describe("STAC asset mapping — the rule set over the kernel mapper", () => {
    it("a visual-only asset renders without a data binding", () => {
        const result = map({
            visual: asset({ roles: ["wms"], "wms:layers": "base" }),
        });
        expect(result?.renderer?.protocolId).toBe("wms");
        expect(result?.data).toBeUndefined();
    });

    it("pairs a visual asset with an attribute asset of another protocol", () => {
        const result = map({
            visual: asset({ roles: ["wms"], "wms:layers": "base" }),
            attributes: asset({ roles: ["wfs"] }),
        });
        expect(result?.renderer?.protocolId).toBe("wms");
        expect(result?.data?.protocolId).toBe("wfs");
    });

    it("lets one ogc-features binding serve both slots", () => {
        const result = map({ features: asset({ roles: ["ogc-feature-api"] }) });
        expect(result?.renderer?.protocolId).toBe(OGC_PROTOCOL_ID);
        expect(result?.data?.protocolId).toBe(OGC_PROTOCOL_ID);
        expect(result?.data).toEqual(result?.renderer);
    });

    it("resolves slots independently — a tie keeps the earlier asset", () => {
        // Consciously pinned: with equal fitness the earlier asset wins
        // each slot, even when it already renders.
        const result = map({
            first: asset({ roles: ["ogc-feature-api"] }),
            second: asset({ roles: ["wfs"] }),
        });
        expect(result?.renderer?.protocolId).toBe(OGC_PROTOCOL_ID);
        expect(result?.data?.protocolId).toBe(OGC_PROTOCOL_ID);
    });

    it("prefers the higher renderer fitness among competing visuals", () => {
        const result = map({
            tiles: asset({ roles: [MVT_PROTOCOL_ID] }),
            wms: asset({ roles: ["wms"], "wms:layers": "overlay" }),
        });
        expect(result?.renderer?.protocolId).toBe("wms");
    });

    it("routes table-less protocols to report rows", () => {
        const result = map({
            doc: asset({ href: "https://example.test/x.pdf", type: "application/pdf" }),
        });
        expect(result?.renderer).toBeUndefined();
        expect(result?.data).toBeUndefined();
        expect(result?.relatedObjects).toHaveLength(1);
        expect(result?.relatedObjects[0]?.type).toBe("report");
    });

    it("keeps reports alongside bindings", () => {
        const result = map({
            visual: asset({ roles: ["point-cloud"] }),
            doc: asset({ href: "https://example.test/report.pdf", type: "application/pdf" }),
        });
        expect(result?.renderer?.protocolId).toBe("copc");
        expect(result?.relatedObjects).toHaveLength(1);
    });

    it("returns null when nothing resolves", () => {
        expect(map({ mystery: asset({ type: "application/unknown" }) })).toBeNull();
    });

    it("detects xyz tiles by URL pattern without roles", () => {
        const result = map({
            tiles: asset({ href: "https://example.test/{z}/{x}/{y}.png" }),
        });
        expect(result?.renderer?.protocolId).toBe("xyz");
    });

    it("a vector-tile asset with a {z}/{x}/{y} URL stays vector-tile", () => {
        // MVT templates share the XYZ URL shape; the raster URL heuristic
        // must not claim them (it runs at a lower priority number).
        const result = map({
            tiles: asset({
                href: "https://tiles.example/planet/{z}/{x}/{y}.pbf",
                type: "application/vnd.mapbox-vector-tile",
                roles: [MVT_PROTOCOL_ID],
                "vector:layer": "water",
            }),
        });
        expect(result?.renderer?.protocolId).toBe(MVT_PROTOCOL_ID);
        expect(result?.renderer?.params.sourceLayer).toBe("water");
    });

    it("an MVT-typed asset without roles is not claimed as xyz", () => {
        const result = map({
            tiles: asset({
                href: "https://tiles.example/planet/{z}/{x}/{y}.pbf",
                type: "application/vnd.mapbox-vector-tile",
            }),
        });
        expect(result).toBeNull();
    });

    it("passes vector tile source layer and type through params", () => {
        const result = map({
            tiles: asset({
                roles: [MVT_PROTOCOL_ID],
                "vector:layer": "water",
                "vector:layer-type": "fill",
            }),
        });
        expect(result?.renderer?.protocolId).toBe(MVT_PROTOCOL_ID);
        expect(result?.renderer?.params.sourceLayer).toBe("water");
        expect(result?.renderer?.params.layerType).toBe("fill");
    });

    it("resolves vector tiles without extension fields", () => {
        const result = map({
            tiles: asset({ roles: [MVT_PROTOCOL_ID] }),
        });
        expect(result?.renderer?.protocolId).toBe(MVT_PROTOCOL_ID);
        expect(result?.renderer?.params.sourceLayer).toBeUndefined();
        expect(result?.renderer?.params.layerType).toBeUndefined();
    });

    it("maps the ogc role through the geojson rule to ogc-features", () => {
        const result = map({
            collection: asset({ roles: ["ogc"], type: "application/json" }),
        });
        expect(result?.renderer?.protocolId).toBe(OGC_PROTOCOL_ID);
        expect(result?.data?.protocolId).toBe(OGC_PROTOCOL_ID);
    });
});
