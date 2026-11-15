import { describe, expect, it } from "vitest";
import proj4 from "proj4";
import { computeFeatureInfoPixel } from "./featureInfo";

const toMercator = proj4("EPSG:4326", "EPSG:3857");

const SPB_VIEW = {
    center: { lng: 30.3, lat: 59.9 },
    zoom: 8,
    width: 800,
    height: 600,
};

describe("computeFeatureInfoPixel", () => {
    it("maps the viewport center to the image center", () => {
        const pixel = computeFeatureInfoPixel({
            ...SPB_VIEW,
            click: { lng: 30.3, lat: 59.9 },
        });
        expect(pixel.x).toBe(400);
        expect(pixel.y).toBe(300);
    });

    it("maps a click to the Web Mercator image pixel", () => {
        const pixel = computeFeatureInfoPixel({
            ...SPB_VIEW,
            click: { lng: 30.9, lat: 60.2 },
        });
        expect(pixel.x).toBe(618);
        expect(pixel.y).toBe(81);
    });

    it("projects pixels in Web Mercator, not lng/lat space", () => {
        const view = {
            center: { lng: 0, lat: 50 },
            zoom: 8,
            width: 1000,
            height: 1000,
            click: { lng: 0, lat: 0 },
        };
        const pixel = computeFeatureInfoPixel(view);
        const [w, s] = toMercator.inverse([pixel.bbox.west, pixel.bbox.south]);
        const [e, n] = toMercator.inverse([pixel.bbox.east, pixel.bbox.north]);
        const geoMid = { lng: (w + e) / 2, lat: (s + n) / 2 };

        const centered = computeFeatureInfoPixel({
            ...view,
            click: geoMid,
        });

        // The geographic image center sits south of the Mercator center line,
        // so a lng/lat-linear interpolation would place it at y = 500.
        expect(centered.x).toBe(500);
        expect(centered.y).toBeGreaterThan(500);
    });

    it("projects the image bounds into EPSG:3857 meters", () => {
        const pixel = computeFeatureInfoPixel({
            ...SPB_VIEW,
            click: { lng: 30.3, lat: 59.9 },
        });
        expect(pixel.bbox.west).toBeCloseTo(3250681.33, 1);
        expect(pixel.bbox.south).toBeCloseTo(8285783.13, 1);
        expect(pixel.bbox.east).toBeCloseTo(3495279.82, 1);
        expect(pixel.bbox.north).toBeCloseTo(8469232.0, 1);
    });

    it("recovers the clicked point via the server pixel formula", () => {
        const view = {
            ...SPB_VIEW,
            click: { lng: 30.9, lat: 60.2 },
        };
        const pixel = computeFeatureInfoPixel(view);
        const [lng, lat] = toMercator.inverse([
            pixel.bbox.west +
                (pixel.x / view.width) * (pixel.bbox.east - pixel.bbox.west),
            pixel.bbox.north -
                (pixel.y / view.height) *
                    (pixel.bbox.north - pixel.bbox.south),
        ]);
        expect(lng).toBeCloseTo(view.click.lng, 2);
        expect(lat).toBeCloseTo(view.click.lat, 2);
    });

    it("normalizes a wrapped click longitude across the antimeridian", () => {
        const east = computeFeatureInfoPixel({
            center: { lng: 179.9, lat: 0 },
            zoom: 10,
            width: 800,
            height: 600,
            click: { lng: -179.9, lat: 0 },
        });
        expect(east.x).toBe(691);
        expect(east.y).toBe(300);

        const west = computeFeatureInfoPixel({
            center: { lng: -179.9, lat: 0 },
            zoom: 10,
            width: 800,
            height: 600,
            click: { lng: 179.9, lat: 0 },
        });
        expect(west.x).toBe(109);
        expect(west.y).toBe(300);
    });
});
