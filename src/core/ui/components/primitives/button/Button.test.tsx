// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Button } from "./Button";

afterEach(cleanup);

/** Class list of the button's Text label. */
function labelClasses(name: string): string {
    const label = screen
        .getByRole("button", { name })
        .querySelector("span");
    return label?.getAttribute("class") ?? "";
}

describe("Button", () => {
    // CSS modules come back as generated stub names here, so these prove
    // the variant→tone wiring onto the label; the tone→CSS-class existence
    // is pinned by Text.test.ts against the real stylesheet.
    it("a primary button labels in the on-accent tone", () => {
        render(<Button variant="primary">Save</Button>);

        expect(labelClasses("Save")).toContain("on-accent");
    });

    it("a default button keeps the plain body tone", () => {
        render(<Button>Cancel</Button>);

        expect(labelClasses("Cancel")).not.toContain("on-accent");
        expect(labelClasses("Cancel")).not.toContain("error");
    });

    it("a danger button labels in the error tone", () => {
        render(<Button variant="danger">Delete</Button>);

        expect(labelClasses("Delete")).toContain("error");
    });
});
