import { describe, expect, it } from "vitest";
import { createLocalMetricFrame } from "./localMetricFrame";

describe("createLocalMetricFrame", () => {
    it.each([0, 56, -56])("maps its anchor to the origin at lat %i", (lat) => {
        const frame = createLocalMetricFrame(30, lat);

        const [x, y] = frame.toMeters(30, lat);

        expect(x).toBeCloseTo(0, 6);
        expect(y).toBeCloseTo(0, 6);
    });

    it("round-trips degrees through meters", () => {
        const frame = createLocalMetricFrame(30, 56);

        const [lng, lat] = frame.toDegrees(
            ...frame.toMeters(30.0008, 55.9994),
        );

        expect(lng).toBeCloseTo(30.0008, 9);
        expect(lat).toBeCloseTo(55.9994, 9);
    });

    it("scales a degree of longitude by the parallel length at the latitude", () => {
        const frame = createLocalMetricFrame(30, 56);

        const [x] = frame.toMeters(30.001, 56);

        // Hand reference 111320·cos(56°) ≈ 62.254; the WGS84 ellipsoid
        // truth is ≈ 62.365 — both inside the band below.
        expect(x).toBeGreaterThan(61.9);
        expect(x).toBeLessThan(62.6);
    });

    it("scales a degree of latitude by the meridian length", () => {
        const frame = createLocalMetricFrame(30, 56);

        const [, y] = frame.toMeters(30, 56.001);

        // Hand reference 111132 m/deg; the WGS84 ellipsoid truth at 56° is
        // ≈ 111414 — both inside the band below.
        expect(y).toBeGreaterThan(110.9);
        expect(y).toBeLessThan(111.6);
    });

    it("treats east and north independently at non-equator latitudes", () => {
        const frame = createLocalMetricFrame(30, 56);

        const [x, y] = frame.toMeters(30.001, 56.001);

        // A longitude degree is cos(56°) shorter than a latitude degree —
        // the confusion this frame exists to prevent.
        expect(x).toBeLessThan(y / 1.7);
    });
});
