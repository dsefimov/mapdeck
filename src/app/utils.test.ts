import { describe, expect, it } from "vitest";
import {
    convertPointToDegrees,
    formatArea,
    formatDistance,
    formatVolume,
} from "./utils";

describe("mapdeck/utils subpath", () => {
    it("re-exports the geo formatters", () => {
        expect(formatDistance(1500)).toBe("1.50 km");
        expect(formatArea(20_000)).toBe("2.00 ha");
        expect(formatVolume(2)).toBe("2.00 m³");
        expect(convertPointToDegrees({ lng: 30, lat: 60, z: 5 })).toEqual([
            30, 60, 5,
        ]);
    });
});
