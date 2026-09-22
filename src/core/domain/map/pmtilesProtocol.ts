import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

const pmtilesProtocol = new Protocol();

/**
 * Teach maplibre the pmtiles:// scheme before any map exists — sources
 * behind the custom protocol resolve through it. Called by the map
 * lifecycle's single creation point, so no importer of this module
 * configures the engine as a side effect.
 */
export function registerPmtilesProtocol(): void {
    maplibregl.addProtocol("pmtiles", pmtilesProtocol.tile);
}
