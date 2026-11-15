import { describe, expect, it } from "vitest";
import type { Protocol } from "@core/contracts";
import { WfsProtocol } from "./wfs/WfsProtocol";
import { WmsProtocol } from "./wms/WmsProtocol";
import { createXyzProtocol } from "./xyz/XyzProtocol";
import { createCogProtocol } from "./cog/CogProtocol";
import { CopcProtocol } from "./copc";
import { VectorTileProtocol } from "./vector-tile/VectorTileProtocol";
import { createGeoJsonTiledProtocol } from "./geojson-tiled/GeoJsonTiledProtocol";
import { OgcFeaturesProtocol } from "./ogc-features/OgcFeaturesProtocol";

/**
 * Pins the featureSelection capability of every built-in protocol
 * (ADR-0022): the selection tool's target list is derived from these
 * declarations, so a silently dropped flag removes a protocol's layers
 * from selection.
 */
describe("built-in protocols declare the selection capability honestly", () => {
    it("feature-serving protocols declare it", () => {
        const attrAdapter = {} as never;
        expect(new VectorTileProtocol().featureSelection).toBe(true);
        expect(createGeoJsonTiledProtocol().featureSelection).toBe(true);
        expect(new OgcFeaturesProtocol(attrAdapter).featureSelection).toBe(
            true,
        );
        expect(new WfsProtocol(attrAdapter).featureSelection).toBe(true);
    });

    it("raster and point-cloud protocols do not", () => {
        // The flag is an optional contract member absent from these
        // classes — read through the Protocol type, where it is visible.
        expect(
            (new WmsProtocol() as Protocol).featureSelection,
        ).toBeUndefined();
        expect(
            (createXyzProtocol() as Protocol).featureSelection,
        ).toBeUndefined();
        expect(
            (createCogProtocol() as Protocol).featureSelection,
        ).toBeUndefined();
        expect(
            (new CopcProtocol() as Protocol).featureSelection,
        ).toBeUndefined();
    });
});
