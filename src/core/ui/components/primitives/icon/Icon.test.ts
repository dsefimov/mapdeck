import { describe, expect, it } from "vitest";
import { customIconStyle } from "./Icon";

describe("customIconStyle", () => {
    it("renders a token name through the --icon-<name> var", () => {
        expect(customIconStyle("terrain")).toEqual({
            maskImage: "var(--icon-terrain)",
            WebkitMaskImage: "var(--icon-terrain)",
        });
    });

    it.each(["", "with space", "dot.name", 'quote"name', "slash/name"])(
        "rejects %s — not a token identifier",
        (name) => {
            expect(customIconStyle(name)).toBeUndefined();
        },
    );
});
