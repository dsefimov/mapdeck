import { describe, expect, it } from "vitest";
import { validateSettingValue } from "./validateSettingValue";
import type { RegisteredSetting } from "@core/contracts";

function registered<T extends RegisteredSetting>(setting: T): T {
    return setting;
}

describe("validateSettingValue", () => {
    it("accepts a valid value per type", () => {
        expect(
            validateSettingValue(
                registered({
                    id: "s",
                    label: "S",
                    type: "string",
                    defaultValue: "a",
                    ownerId: "o",
                    ownerName: "O",
                    value: "a",
                }),
                "hello",
            ),
        ).toEqual({ ok: true, value: "hello" });
        expect(
            validateSettingValue(
                registered({
                    id: "n",
                    label: "N",
                    type: "number",
                    defaultValue: 1,
                    min: 0,
                    max: 10,
                    ownerId: "o",
                    ownerName: "O",
                    value: 1,
                }),
                5,
            ),
        ).toEqual({ ok: true, value: 5 });
        expect(
            validateSettingValue(
                registered({
                    id: "b",
                    label: "B",
                    type: "boolean",
                    defaultValue: false,
                    ownerId: "o",
                    ownerName: "O",
                    value: false,
                }),
                true,
            ),
        ).toEqual({ ok: true, value: true });
    });

    it("rejects a wrong type with reason type", () => {
        const setting = registered({
            id: "n",
            label: "N",
            type: "number",
            defaultValue: 1,
            ownerId: "o",
            ownerName: "O",
            value: 1,
        });
        expect(validateSettingValue(setting, "5")).toEqual({
            ok: false,
            reason: "type",
        });
        expect(
            validateSettingValue(
                registered({
                    id: "s",
                    label: "S",
                    type: "string",
                    defaultValue: "a",
                    ownerId: "o",
                    ownerName: "O",
                    value: "a",
                }),
                42,
            ),
        ).toEqual({ ok: false, reason: "type" });
    });

    it("rejects a number below min or above max with reason range", () => {
        const setting = registered({
            id: "n",
            label: "N",
            type: "number",
            defaultValue: 50,
            min: 0,
            max: 100,
            ownerId: "o",
            ownerName: "O",
            value: 50,
        });
        expect(validateSettingValue(setting, -1)).toEqual({
            ok: false,
            reason: "range",
        });
        expect(validateSettingValue(setting, 150)).toEqual({
            ok: false,
            reason: "range",
        });
        expect(validateSettingValue(setting, 50)).toEqual({ ok: true, value: 50 });
    });

    it("rejects a select value not in options with reason select", () => {
        const setting = registered({
            id: "sel",
            label: "Sel",
            type: "select",
            defaultValue: "a",
            options: [
                { label: "A", value: "a" },
                { label: "B", value: "b" },
            ],
            ownerId: "o",
            ownerName: "O",
            value: "a",
        });
        expect(validateSettingValue(setting, "c")).toEqual({
            ok: false,
            reason: "select",
        });
        expect(validateSettingValue(setting, "b")).toEqual({ ok: true, value: "b" });
    });
});
