// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CollapsibleMenu } from "./CollapsibleMenu";

afterEach(cleanup);

describe("CollapsibleMenu", () => {
    it("renders its content inside a focusable group panel", () => {
        render(
            <CollapsibleMenu open>
                <button type="button">report</button>
            </CollapsibleMenu>,
        );

        const panel = screen.getByRole("group");
        expect(panel).toHaveAttribute("tabindex", "-1");
        expect(screen.getByRole("button", { name: "report" })).toBeInTheDocument();
    });

    it("moves focus into the panel when open", async () => {
        render(
            <CollapsibleMenu open>
                <button type="button">report</button>
            </CollapsibleMenu>,
        );

        await waitFor(() => {
            expect(document.activeElement).toBe(screen.getByRole("group"));
        });
    });

    it("closes on Escape", () => {
        const onClose = vi.fn();
        render(
            <CollapsibleMenu open onClose={onClose}>
                <button type="button">report</button>
            </CollapsibleMenu>,
        );

        fireEvent.keyDown(screen.getByTestId("collapsible-menu"), {
            key: "Escape",
        });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("renders nothing when hideIfEmpty and no children", () => {
        render(<CollapsibleMenu hideIfEmpty />);

        expect(screen.queryByTestId("collapsible-menu")).toBeNull();
    });
});
