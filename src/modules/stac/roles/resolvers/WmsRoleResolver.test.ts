import { describe, expect, it } from "vitest";
import type { AssetContext, SourceAsset } from "@core/contracts";
import { WmsRoleResolver } from "./WmsRoleResolver";

const ctx: AssetContext = { assetKey: "tiles" };

const ENDPOINT = "https://wms.example.test/service";

function wmsAsset(
    href: string,
    fields: Partial<SourceAsset> = {},
): SourceAsset {
    return { href, roles: ["wms"], ...fields };
}

describe("WmsRoleResolver binding from a full GetMap URL", () => {
    it("splits the href into a clean endpoint and params", () => {
        const resolver = new WmsRoleResolver();

        const assignment = resolver.resolve(
            wmsAsset(
                `${ENDPOINT}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=roads,rails&STYLES=styleA&FORMAT=image/png`,
            ),
            ctx,
        );

        expect(assignment.sourceUrl).toBe(ENDPOINT);
        expect(assignment.params).toMatchObject({
            layers: "roads,rails",
            styles: "styleA",
            version: "1.1.1",
            format: "image/png",
        });
    });

    it("keeps a clean endpoint untouched and reads layers from the asset field", () => {
        const resolver = new WmsRoleResolver();

        const assignment = resolver.resolve(
            wmsAsset(ENDPOINT, {
                "wms:layers": "roads",
            }),
            ctx,
        );

        expect(assignment.sourceUrl).toBe(ENDPOINT);
        expect(assignment.params).toMatchObject({ layers: "roads" });
        expect(assignment.params).not.toHaveProperty("version");
    });

    it("lets query parameters win over the asset fields", () => {
        const resolver = new WmsRoleResolver();

        const assignment = resolver.resolve(
            wmsAsset(`${ENDPOINT}?LAYERS=from-url`, {
                "wms:layers": "from-field",
            }),
            ctx,
        );

        expect(assignment.params).toMatchObject({ layers: "from-url" });
    });

    it("omits the layers key when neither URL nor field carries layers", () => {
        const resolver = new WmsRoleResolver();

        const assignment = resolver.resolve(wmsAsset(ENDPOINT), ctx);

        expect(assignment.params).not.toHaveProperty("layers");
    });

    it("yields an empty endpoint for an unparseable href", () => {
        const resolver = new WmsRoleResolver();

        const assignment = resolver.resolve(
            wmsAsset("https://localhost:99999"),
            ctx,
        );

        expect(assignment.sourceUrl).toBe("");
        expect(assignment.params).not.toHaveProperty("layers");
    });

    it("yields an empty endpoint for a non-http href", () => {
        const resolver = new WmsRoleResolver();

        const assignment = resolver.resolve(
            wmsAsset("javascript:alert(1)?LAYERS=roads"),
            ctx,
        );

        expect(assignment.sourceUrl).toBe("");
        expect(assignment.params).not.toHaveProperty("layers");
    });

    it("splits a document-relative GetMap href", () => {
        const resolver = new WmsRoleResolver();

        const assignment = resolver.resolve(
            wmsAsset(
                "/geoserver/main/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=roads&STYLES=&FORMAT=image/png",
            ),
            ctx,
        );

        expect(assignment.sourceUrl.endsWith("/geoserver/main/wms")).toBe(
            true,
        );
        expect(assignment.params).toMatchObject({
            layers: "roads",
            format: "image/png",
        });
    });
});
