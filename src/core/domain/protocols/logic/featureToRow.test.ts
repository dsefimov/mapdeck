import { describe, expect, it } from "vitest";

import { featureToRow } from "./featureToRow";

const POINT = {
    type: "Point",
    coordinates: [30.5, 59.9],
};

describe("featureToRow", () => {
    it("spreads properties into the row", () => {
        expect(featureToRow(POINT, { name: "A", area: 10 })).toEqual({
            name: "A",
            area: 10,
            _bbox: expect.objectContaining({ west: 30.5 }),
        });
    });

    it("derives `_bbox` from geometry and omits it when geometry is null", () => {
        const withGeometry = featureToRow(POINT, {});
        expect(withGeometry._bbox).toMatchObject({
            west: 30.5,
            south: 59.9,
            east: 30.5,
            north: 59.9,
        });

        const withoutGeometry = featureToRow(null, { name: "B" });
        expect(withoutGeometry._bbox).toBeUndefined();
        expect(withoutGeometry).toEqual({ name: "B" });
    });

    it("keeps the service-reserved `_bbox` over a colliding data key", () => {
        const row = featureToRow(POINT, { _bbox: "spoof" });
        expect(row._bbox).not.toBe("spoof");
        expect(row._bbox).toMatchObject({ west: 30.5 });
    });

    it("carries the feature-level id as _featureId, omitted when absent", () => {
        expect(featureToRow(POINT, { name: "A" }, "paris")._featureId).toBe(
            "paris",
        );
        expect(featureToRow(POINT, { name: "A" }, null)._featureId).toBeUndefined();
        expect(featureToRow(POINT, { name: "A" })._featureId).toBeUndefined();
    });

    it("treats missing properties as an empty row", () => {
        expect(featureToRow(null, undefined)).toEqual({});
    });
});
