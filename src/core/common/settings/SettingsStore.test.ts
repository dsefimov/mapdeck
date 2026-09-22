import { describe, expect, it, vi } from "vitest";
import type {
    RegisteredSetting,
    SettingMetadata,
    SettingOption,
} from "@core/contracts";
import { logger } from "@core/lib/logger";
import { SettingsStore } from "./SettingsStore";

const OWNER = "owner-widget";
const OWNER_NAME = "Owner Widget";

function asSelect(setting: RegisteredSetting): Extract<RegisteredSetting, { type: "select" }> {
    if (setting.type !== "select") throw new Error("not a select setting");
    return setting;
}

function select(
    id: string,
    options: SettingOption[],
    defaultValue = options[0]!.value,
): SettingMetadata {
    return { id, label: id, type: "select", defaultValue, options };
}

function metadata(id: string, type: "string" | "number" | "boolean"): SettingMetadata {
    const defaults = {
        string: "en",
        number: 5,
        boolean: true,
    } as const;
    return {
        id,
        label: id,
        type,
        defaultValue: defaults[type],
    } as SettingMetadata;
}

/** A store with one owner holding a select and a plain setting. */
function storeWith(): SettingsStore {
    const store = new SettingsStore();
    store.registerSettings(OWNER, OWNER_NAME, [
        select("scheme", [
            { label: "RGB", value: "rgb" },
            { label: "Elevation", value: "elev" },
        ]),
        metadata("threshold", "number"),
    ]);
    return store;
}

describe("SettingsStore.registerSettings", () => {
    it("stamps each setting with its owner and the default value", () => {
        const store = storeWith();
        const [scheme, threshold] = store.getOwnerSettings(OWNER);

        expect(scheme).toMatchObject({
            ownerId: OWNER,
            ownerName: OWNER_NAME,
            value: "rgb",
        });
        expect(threshold).toMatchObject({ ownerId: OWNER, value: 5 });
    });

    it("treats an empty batch as a no-op", () => {
        const store = new SettingsStore();

        store.registerSettings(OWNER, "Owner", []);

        expect(store.allSettingsGrouped).toEqual([]);
    });

    it("throws when an id is already registered — the registry policy", () => {
        const store = storeWith();

        expect(() =>
            store.registerSettings(OWNER, OWNER_NAME, [
                select("scheme", [{ label: "Red", value: "red" }]),
            ]),
        ).toThrow(/already registered/);
        expect(store.getStringSetting("scheme")).toBe("rgb");
    });

    it("names the existing owner in the duplicate message", () => {
        const store = new SettingsStore();
        store.registerSettings("owner-a", "A", [metadata("dup", "string")]);

        expect(() =>
            store.registerSettings("owner-b", "B", [metadata("dup", "number")]),
        ).toThrow(/owner "owner-a"/);
    });
});

describe("SettingsStore.setSetting", () => {
    it("reports 'notfound' for an unknown setting", () => {
        const error = vi.spyOn(logger, "error").mockImplementation(() => {});
        const store = storeWith();

        const result = store.setSetting("ghost", 1);

        expect(result).toEqual({ ok: false, reason: "notfound" });
        expect(error).toHaveBeenCalledWith(expect.stringContaining("ghost"));
        error.mockRestore();
    });
});

describe("SettingsStore.updateSettingOptions", () => {
    it("replaces the options of a select setting, keeping owner and value", () => {
        const store = storeWith();

        store.updateSettingOptions("scheme", [
            { label: "Intensity", value: "int" },
        ]);

        const scheme = asSelect(store.getOwnerSettings(OWNER)[0]!);
        expect(scheme.options).toEqual([{ label: "Intensity", value: "int" }]);
        expect(scheme.ownerId).toBe(OWNER);
        // The current value survives even though it left the option list.
        expect(scheme.value).toBe("rgb");
    });

    it("is a no-op for an unknown setting id", () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const store = storeWith();

        store.updateSettingOptions("ghost", []);

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('"ghost"'));
        expect(asSelect(store.getOwnerSettings(OWNER)[0]!).options).toHaveLength(2);
    });

    it("is a no-op for a non-select setting", () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const store = storeWith();

        store.updateSettingOptions("threshold", [
            { label: "X", value: "x" },
        ]);

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("non-select"),
        );
        expect(store.getNumberSetting("threshold")).toBe(5);
    });
});

describe("SettingsStore typed getters", () => {
    it.each([
        ["string", "getStringSetting"],
        ["number", "getNumberSetting"],
        ["boolean", "getBooleanSetting"],
    ] as const)("%s getter serves its own type", (type, getter) => {
        const store = new SettingsStore();
        store.registerSettings(OWNER, "Owner", [metadata("s", type)]);

        expect(store[getter]("s")).toBeDefined();
    });

    it.each([
        ["string", "getNumberSetting"],
        ["string", "getBooleanSetting"],
        ["number", "getStringSetting"],
        ["boolean", "getStringSetting"],
    ] as const)("the %s setting is invisible to %s", (type, getter) => {
        const store = new SettingsStore();
        store.registerSettings(OWNER, "Owner", [metadata("s", type)]);

        expect(store[getter]("s")).toBeUndefined();
    });
});
