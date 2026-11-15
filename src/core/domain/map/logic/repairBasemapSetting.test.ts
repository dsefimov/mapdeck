import { describe, expect, it } from "vitest";
import { repairBasemapSetting } from "./repairBasemapSetting";

const CONFIGS = [
    { id: "bm-a", name: "Alpha" },
    { id: "bm-b", name: "Beta" },
];

const OPTIONS = [
    { label: "Alpha", value: "bm-a" },
    { label: "Beta", value: "bm-b" },
];

describe("repairBasemapSetting", () => {
    it.each([
        [
            "keeps a valid value and default",
            { value: "bm-b", defaultValue: "bm-a" },
            {},
        ],
        [
            "repairs a value naming no registered basemap",
            { value: "ghost", defaultValue: "bm-a" },
            { value: "bm-a" },
        ],
        [
            "repairs an empty default",
            { value: "bm-a", defaultValue: "" },
            { defaultValue: "bm-a" },
        ],
        [
            "repairs the initial empty state",
            { value: "", defaultValue: "" },
            { value: "bm-a", defaultValue: "bm-a" },
        ],
        [
            "repairs an unregistered setting",
            { value: undefined, defaultValue: undefined },
            { value: "bm-a", defaultValue: "bm-a" },
        ],
    ])(
        "%s",
        (
            _case,
            current: { value: string | undefined; defaultValue: string | undefined },
            expected: { value?: string; defaultValue?: string },
        ) => {
            const repair = repairBasemapSetting(CONFIGS, current);

            expect(repair.options).toEqual(OPTIONS);
            expect(repair.value).toBe(expected.value);
            expect(repair.defaultValue).toBe(expected.defaultValue);
        },
    );

    it("touches no value while the registry is empty", () => {
        const repair = repairBasemapSetting([], {
            value: "anything",
            defaultValue: "anything",
        });

        expect(repair).toEqual({ options: [] });
    });
});
