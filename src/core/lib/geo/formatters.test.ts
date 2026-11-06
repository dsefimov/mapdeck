import { describe, expect, it } from "vitest";
import {
    formatDistance,
    formatArea,
    formatVolume,
    geoPointToLngLatZ,
} from "./formatters";

describe("formatDistance", () => {
    it("picks the unit by magnitude", () => {
        expect(formatDistance(0.5)).toBe("50.0 cm");
        expect(formatDistance(2)).toBe("2.00 m");
        expect(formatDistance(1500)).toBe("1.50 km");
    });

    it.each([
        [[999.999, 1000], "1.00 km"],
        [[0.9999999, 1], "1.00 m"],
    ])("re-tiers rounding boundaries %s → %s", (inputs, expected) => {
        for (const input of inputs) {
            expect(formatDistance(input)).toBe(expected);
        }
    });

    it("keeps the sign but picks the unit by magnitude", () => {
        expect(formatDistance(-1500)).toBe("-1.50 km");
    });

    it("renders NaN as an em dash", () => {
        expect(formatDistance(Number.NaN)).toBe("—");
    });
});

describe("formatArea", () => {
    it("escalates cm² → m² → ha → km² by magnitude", () => {
        expect(formatArea(0.5)).toBe("5000.0 cm²");
        expect(formatArea(25)).toBe("25.00 m²");
        expect(formatArea(20_000)).toBe("2.00 ha");
        expect(formatArea(2_000_000)).toBe("2.000 km²");
    });

    it("re-tiers when rounding crosses the boundary", () => {
        expect(formatArea(9999.995)).toBe("1.00 ha");
        expect(formatArea(999_999.999)).toBe("1.000 km²");
    });
});

describe("formatVolume", () => {
    it("escalates ml → litres → m³ → km³ by magnitude", () => {
        expect(formatVolume(0.0005)).toBe("500.0 ml");
        expect(formatVolume(0.5)).toBe("500.0 litres");
        expect(formatVolume(12)).toBe("12.00 m³");
        expect(formatVolume(2_000_000)).toBe("2.000 km³");
    });

    it("re-tiers when rounding crosses the boundary", () => {
        expect(formatVolume(0.9999999)).toBe("1.00 m³");
        expect(formatVolume(999_999.999)).toBe("1.000 km³");
    });
});

describe("geoPointToLngLatZ", () => {
    it("unpacks a GeoPoint into a [lng, lat, z] tuple", () => {
        expect(
            geoPointToLngLatZ({ lng: 30, lat: 59, z: 12 }),
        ).toEqual([30, 59, 12]);
    });
});
