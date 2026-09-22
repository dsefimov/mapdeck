import proj4 from "proj4";
import { WebMercatorViewport } from "@deck.gl/core";

const projectToMercator = proj4("EPSG:4326", "EPSG:3857");

/** Viewport state needed to locate a click inside a WMS image. */
export interface FeatureInfoView {
    center: { lng: number; lat: number };
    zoom: number;
    width: number;
    height: number;
    click: { lng: number; lat: number };
}

/** Click pixel (I/J) and the image BBOX in EPSG:3857 meters. */
export interface FeatureInfoPixel {
    x: number;
    y: number;
    bbox: { west: number; south: number; east: number; north: number };
}

interface LngLatBounds {
    west: number;
    south: number;
    east: number;
    north: number;
}

interface LngLatPoint {
    lng: number;
    lat: number;
}

/**
 * Locate a map click inside the WMS GetFeatureInfo image.
 * The image is the flat (pitch = bearing = 0) Web Mercator view of the
 * viewport — the same geometry as the rendered GetMap tiles — so the
 * returned pixel is exact for the ground point under the cursor, even when
 * the real camera is tilted or rotated.
 */
export function computeFeatureInfoPixel(
    view: FeatureInfoView,
): FeatureInfoPixel {
    const viewport = buildFlatViewport(view);
    const bounds = getViewportBounds(viewport);
    const click = normalizeClickLng(view.click, bounds);
    return {
        ...projectClick(viewport, click),
        bbox: projectBoundsToMercator(bounds),
    };
}

function buildFlatViewport(view: FeatureInfoView): WebMercatorViewport {
    return new WebMercatorViewport({
        longitude: view.center.lng,
        latitude: view.center.lat,
        zoom: view.zoom,
        width: view.width,
        height: view.height,
        pitch: 0,
        bearing: 0,
    });
}

function getViewportBounds(viewport: WebMercatorViewport): LngLatBounds {
    const [west, south, east, north] = viewport.getBounds();
    return { west, south, east, north };
}

function normalizeClickLng(
    click: LngLatPoint,
    bounds: LngLatBounds,
): LngLatPoint {
    let lng = click.lng;
    if (lng < bounds.west) {
        lng += 360;
    } else if (lng > bounds.east) {
        lng -= 360;
    }
    return { lng, lat: click.lat };
}

function projectClick(
    viewport: WebMercatorViewport,
    click: LngLatPoint,
): { x: number; y: number } {
    const [x, y] = viewport.project([click.lng, click.lat]) as [number, number];
    return { x: Math.round(x), y: Math.round(y) };
}

function projectBoundsToMercator(
    bounds: LngLatBounds,
): FeatureInfoPixel["bbox"] {
    const sw: [number, number] = [bounds.west, bounds.south];
    const ne: [number, number] = [bounds.east, bounds.north];
    const swM = projectToMercator.forward(sw);
    const neM = projectToMercator.forward(ne);
    return { west: swM[0], south: swM[1], east: neM[0], north: neM[1] };
}
