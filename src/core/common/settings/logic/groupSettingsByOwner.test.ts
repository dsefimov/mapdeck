import { describe, expect, it } from "vitest";
import { groupSettingsByOwner } from "./groupSettingsByOwner";
import type { RegisteredSetting } from "@core/contracts";

function registered<T extends RegisteredSetting>(setting: T): T {
    return setting;
}

describe("groupSettingsByOwner", () => {
    it("groups settings by owner, preserving first-appearance order", () => {
        const groups = groupSettingsByOwner([
            registered({
                id: "a",
                label: "A",
                type: "string",
                defaultValue: "",
                ownerId: "owner-1",
                ownerName: "First",
                value: "",
            }),
            registered({
                id: "b",
                label: "B",
                type: "boolean",
                defaultValue: true,
                ownerId: "owner-2",
                ownerName: "Second",
                value: true,
            }),
            registered({
                id: "c",
                label: "C",
                type: "number",
                defaultValue: 1,
                ownerId: "owner-1",
                ownerName: "First",
                value: 2,
            }),
        ]);

        expect(groups.map((g) => g.ownerId)).toEqual(["owner-1", "owner-2"]);
        expect(groups[0]?.ownerName).toBe("First");
        expect(groups[0]?.settings.map((s) => s.id)).toEqual(["a", "c"]);
        expect(groups[1]?.settings.map((s) => s.id)).toEqual(["b"]);
    });

    it("uses the first setting's ownerName for the group", () => {
        const groups = groupSettingsByOwner([
            registered({
                id: "x",
                label: "X",
                type: "string",
                defaultValue: "",
                ownerId: "o",
                ownerName: "First Name",
                value: "",
            }),
            registered({
                id: "y",
                label: "Y",
                type: "string",
                defaultValue: "",
                ownerId: "o",
                ownerName: "Different Name",
                value: "",
            }),
        ]);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.ownerName).toBe("First Name");
    });

    it("returns an empty array for no settings", () => {
        expect(groupSettingsByOwner([])).toEqual([]);
    });
});
