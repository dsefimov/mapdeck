import { describe, expect, it } from "vitest";
import type { SettingMetadata } from "@core/contracts";
import { SettingsStore } from "@core/common/settings";
import { applySettingsOverrides } from "./applySettingsOverrides";

const STRING_ID = "test.string";
const NUMBER_ID = "test.number";
const BOOLEAN_ID = "test.boolean";
const SELECT_ID = "test.select";

const METADATA: readonly SettingMetadata[] = [
    { id: STRING_ID, type: "string", defaultValue: "default", label: "S" },
    { id: NUMBER_ID, type: "number", defaultValue: 5, min: 0, max: 10, label: "N" },
    { id: BOOLEAN_ID, type: "boolean", defaultValue: false, label: "B" },
    {
        id: SELECT_ID,
        type: "select",
        defaultValue: "a",
        options: [
            { label: "A", value: "a" },
            { label: "B", value: "b" },
        ],
        label: "P",
    },
];

/** A fresh store carrying one setting of every registered value kind. */
function freshStore(): SettingsStore {
    const store = new SettingsStore();
    store.registerSettings("test-owner", "Test owner", [...METADATA]);
    return store;
}

describe("applySettingsOverrides", () => {
    it.each([
        {
            kind: "string",
            id: STRING_ID,
            value: "overridden",
            read: (s: SettingsStore) => s.getStringSetting(STRING_ID),
        },
        {
            kind: "number",
            id: NUMBER_ID,
            value: 7,
            read: (s: SettingsStore) => s.getNumberSetting(NUMBER_ID),
        },
        {
            kind: "boolean",
            id: BOOLEAN_ID,
            value: true,
            read: (s: SettingsStore) => s.getBooleanSetting(BOOLEAN_ID),
        },
        {
            kind: "select",
            id: SELECT_ID,
            value: "b",
            read: (s: SettingsStore) => s.getStringSetting(SELECT_ID),
        },
    ])("applies a valid $kind value", ({ id, value, read }) => {
        const store = freshStore();

        applySettingsOverrides(store, { [id]: value });

        expect(read(store)).toBe(value);
    });

    it.each([
        { case: "an unknown id", id: "test.ghost", value: 1, reason: "notfound" },
        { case: "a wrong type", id: NUMBER_ID, value: "nope", reason: "type" },
        {
            case: "a select value outside the options",
            id: SELECT_ID,
            value: "c",
            reason: "select",
        },
        {
            case: "a number outside the range",
            id: NUMBER_ID,
            value: 42,
            reason: "range",
        },
    ])("rejects $case", ({ id, value, reason }) => {
        const store = freshStore();

        expect(() => applySettingsOverrides(store, { [id]: value })).toThrow(
            new RegExp(`${id} \\(${reason}\\)`),
        );
    });

    it("is a no-op for undefined overrides", () => {
        const store = freshStore();

        expect(() => applySettingsOverrides(store, undefined)).not.toThrow();
        expect(store.getStringSetting(STRING_ID)).toBe("default");
    });

    it("lists every rejected id in one error", () => {
        const store = freshStore();

        expect(() =>
            applySettingsOverrides(store, {
                "test.ghost": 1,
                [NUMBER_ID]: "nope",
            }),
        ).toThrow(/test\.ghost \(notfound\); test\.number \(type\)/);
    });

    it("leaves rejected settings at their declared defaults", () => {
        const store = freshStore();

        expect(() =>
            applySettingsOverrides(store, { [NUMBER_ID]: "nope" }),
        ).toThrow();

        expect(store.getNumberSetting(NUMBER_ID)).toBe(5);
    });
});
