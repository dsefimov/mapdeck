import { describe, expect, it } from "vitest";
import { resolveOwnerName } from "./resolveOwnerName";
import type { SettingsGroup } from "@core/contracts";

function group(ownerId: string, ownerName: string): SettingsGroup {
    return { ownerId, ownerName, settings: [] };
}

describe("resolveOwnerName", () => {
    it("uses the widget name when present", () => {
        const t = (ns: string) =>
            ns === "w1"
                ? { "widget.name": "My Widget" }
                : {};
        expect(resolveOwnerName(t, group("w1", "fallback"))).toBe("My Widget");
    });

    it("uses the tool name when the widget name is absent", () => {
        const t = (ns: string) =>
            ns === "t1" ? { "tool.name": "My Tool" } : {};
        expect(resolveOwnerName(t, group("t1", "fallback"))).toBe("My Tool");
    });

    it("falls back to the owner name when no locale keys exist", () => {
        const t = () => ({});
        expect(resolveOwnerName(t, group("sys", "System Group"))).toBe(
            "System Group",
        );
    });
});
