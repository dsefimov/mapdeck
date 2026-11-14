import { describe, expect, it } from "vitest";
import { stableFeatureKey } from "./featureKey";

describe("stableFeatureKey", () => {
    it("takes the first id-like field in priority order", () => {
        expect(stableFeatureKey({ id: 7 })).toBe("feature-7");
        expect(stableFeatureKey({ ID: "a", id: undefined })).toBe("feature-a");
        expect(stableFeatureKey({ fid: "x1" })).toBe("feature-x1");
    });

    it("skips null and undefined fields, not zero or empty string", () => {
        expect(stableFeatureKey({ id: null, fid: 3 })).toBe("feature-3");
        expect(stableFeatureKey({ id: 0 })).toBe("feature-0");
        expect(stableFeatureKey({ id: "" })).toBe("feature-");
    });

    it("prefers the feature-level id over id-like properties", () => {
        expect(stableFeatureKey({ id: "prop-id" }, "feature-id")).toBe(
            "feature-feature-id",
        );
        expect(stableFeatureKey({}, "paris")).toBe("feature-paris");
        // A row read: the pipeline surfaces the feature id as _featureId.
        expect(stableFeatureKey({ _featureId: "paris", id: 7 })).toBe(
            "feature-paris",
        );
    });

    it("returns null when no id-like field is present", () => {
        expect(stableFeatureKey({ name: "well", Id: null })).toBeNull();
        expect(stableFeatureKey({})).toBeNull();
        expect(stableFeatureKey({}, null)).toBeNull();
    });
});
