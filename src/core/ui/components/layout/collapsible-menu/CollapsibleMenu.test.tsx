// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CollapsibleMenu } from "./CollapsibleMenu";

afterEach(cleanup);

const MENU_TESTID = "collapsible-menu";

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

        fireEvent.keyDown(screen.getByTestId(MENU_TESTID), {
            key: "Escape",
        });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("renders nothing when hideIfEmpty and no children", () => {
        render(<CollapsibleMenu hideIfEmpty />);

        expect(screen.queryByTestId(MENU_TESTID)).toBeNull();
    });

    it("hideIfEmpty sees through children expressed as optional expressions", () => {
        // The layer-tree menu passes `{tools.map(...)}{hasReports && ...}` —
        // an always-truthy array of empties when nothing rendered.
        render(
            <CollapsibleMenu open hideIfEmpty>
                {[].map(() => (
                    <div key="unused" />
                ))}
            </CollapsibleMenu>,
        );

        expect(screen.queryByTestId(MENU_TESTID)).toBeNull();
    });
});
