import { describe, expect, it } from "vitest";
import { readWidgetConfig } from "./widget";

describe("readWidgetConfig", () => {
    it("applies defaults for an absent config", () => {
        expect(readWidgetConfig("w", undefined)).toEqual({
            showInSidebar: true,
            settings: [],
        });
    });

    it("reads the authored groups", () => {
        const groups = readWidgetConfig("w", {
            base: { showInSidebar: false },
            settings: [{ id: "autoscroll", label: "Autoscroll", type: "boolean" }],
            size: { defaultWidth: 4 },
        });

        expect(groups.showInSidebar).toBe(false);
        expect(groups.settings).toHaveLength(1);
        expect(groups.size?.defaultWidth).toBe(4);
    });

    it.each([
        ["a non-object root", "junk"],
        ["a non-object base", { base: 5 }],
        ["a non-boolean showInSidebar", { base: { showInSidebar: "yes" } }],
        ["a non-array settings", { settings: {} }],
        ["a setting without an id", { settings: [{ type: "boolean" }] }],
        ["a non-object size", { size: 7 }],
    ])("rejects %s loudly", (_case, config) => {
        expect(() => readWidgetConfig("w", config)).toThrow(
            /Widget config for "w"/,
        );
    });
});
