import { describe, expect, it } from "vitest";
import type { PickingInfo } from "@deck.gl/core";
import { recordFromDeckPick, recordFromNativeFeature } from "./pickedFeature";

const pick = (object: unknown, index = 3): PickingInfo =>
    ({ object, index }) as unknown as PickingInfo;

describe("recordFromDeckPick", () => {
    it("prefers the GeoJSON feature-level id over id-like properties", () => {
        const record = recordFromDeckPick(
            pick({ id: "paris", properties: { id: "prop-id" } }),
        );

        expect(record?.key).toBe("feature-paris");
    });

    it("falls back to id-like properties, then the pick index", () => {
        expect(
            recordFromDeckPick(pick({ properties: { fid: 7 } }))?.key,
        ).toBe("feature-7");
        expect(recordFromDeckPick(pick({ properties: {} }))?.key).toBe(
            "pick-3",
        );
    });

    it("keeps a geometry footprint when its bbox is computable", () => {
        const record = recordFromDeckPick(
            pick({
                properties: { id: "a" },
                geometry: {
                    type: "Polygon",
                    coordinates: [
                        [
                            [0, 0],
                            [2, 0],
                            [2, 2],
                            [0, 0],
                        ],
                    ],
                },
            }),
        );

        expect(record?.footprint?.kind).toBe("geometry");
        expect(record?.footprint?.bbox.west).toBe(0);
        expect(record?.footprint?.bbox.east).toBe(2);
    });

    it("a position datum becomes a padded point footprint", () => {
        const record = recordFromDeckPick(
            pick({ properties: {}, position: [10, 20, 5] }),
        );

        expect(record?.footprint?.kind).toBe("point");
        if (record?.footprint?.kind === "point") {
            expect(record.footprint.position).toEqual([10, 20, 5]);
            expect(record.footprint.bbox.west).toBeLessThan(10);
            expect(record.footprint.bbox.north).toBeGreaterThan(20);
        }
    });

    it("an unknown geometry with no position has no footprint", () => {
        expect(
            recordFromDeckPick(pick({ properties: {}, geometry: "blob" }))
                ?.footprint,
        ).toBeNull();
        expect(recordFromDeckPick(pick(null))).toBeNull();
    });
});

describe("recordFromNativeFeature", () => {
    it("reads the feature-level id and lnglat geometry", () => {
        const record = recordFromNativeFeature(
            {
                id: "n1",
                properties: { name: "well" },
                geometry: { type: "Point", coordinates: [1, 2] },
            } as never,
            4,
        );

        expect(record.key).toBe("feature-n1");
        expect(record.footprint?.kind).toBe("geometry");
    });

    it("falls back to the query index when no identity exists", () => {
        const record = recordFromNativeFeature(
            { properties: {} } as never,
            9,
        );

        expect(record.key).toBe("pick-9");
        expect(record.footprint).toBeNull();
    });
});
