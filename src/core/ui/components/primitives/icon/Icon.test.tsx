// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Icon } from "./Icon";

afterEach(cleanup);

function renderedIcon(name: string): HTMLElement {
    const { container } = render(<Icon name={name as never} />);
    return container.querySelector("span") as HTMLElement;
}

describe("Icon", () => {
    it("routes any valid name through the --icon-<name> token", () => {
        expect(renderedIcon("zoom").style.getPropertyValue("--icon")).toBe(
            "var(--icon-zoom)",
        );
        expect(renderedIcon("terrain").style.getPropertyValue("--icon")).toBe(
            "var(--icon-terrain)",
        );
    });

    it.each(["", "with space", "dot.name", 'quote"name', "slash/name"])(
        "renders no token for %s — not a token identifier",
        (name) => {
            expect(
                renderedIcon(name).style.getPropertyValue("--icon"),
            ).toBe("");
        },
    );

    it("carries the title as the accessible name", () => {
        render(<Icon name="zoom" title="Zoom" />);
        expect(document.querySelector("span")).toHaveAttribute(
            "aria-label",
            "Zoom",
        );
    });
});
