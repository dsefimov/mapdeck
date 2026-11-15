import { describe, expect, it } from "vitest";

import { parseFeature } from "./parseFeature";

describe("parseFeature", () => {
    it("normalizes id to a string", () => {
        expect(parseFeature({ id: 42 })?.id).toBe("42");
        expect(parseFeature({ id: "abc" })?.id).toBe("abc");
    });

    it("maps absent and null ids to an empty string", () => {
        expect(parseFeature({})?.id).toBe("");
        expect(parseFeature({ id: null })?.id).toBe("");
    });

    it.each([
        ["null feature", null],
        ["undefined feature", undefined],
        ["non-object feature", 42],
        ["string feature", "nope"],
    ])("returns null for %s", (_case, input) => {
        expect(parseFeature(input)).toBeNull();
    });

    it("defaults properties and geometry when missing or non-object", () => {
        const parsed = parseFeature({});
        expect(parsed?.properties).toEqual({});
        expect(parsed?.geometry).toBeNull();

        const broken = parseFeature({
            properties: "nope",
            geometry: "nope",
        });
        expect(broken?.properties).toEqual({});
        expect(broken?.geometry).toBeNull();
    });
});
