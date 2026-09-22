// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import ContextMenu from "./ContextMenu";

afterEach(cleanup);

const TOOLS = [
    { id: "ruler" },
    { id: "area" },
    { id: "volume" },
];

interface MenuOverrides {
    activeToolId?: string | null;
    onClose?: () => void;
}

function renderMenu({
    activeToolId = null,
    onClose = vi.fn(),
}: MenuOverrides = {}) {
    render(
        <ContextMenu
            isOpen
            position={{ x: 10, y: 10 }}
            onClose={onClose}
            tools={TOOLS}
            activeToolId={activeToolId}
            onToolClick={vi.fn()}
            header="Map tools"
            resolveToolName={(id) =>
                TOOLS.find((t) => t.id === id)?.id ?? id
            }
        />,
    );
    return {
        item: (name: string) => screen.getByRole("menuitem", { name }),
        onClose,
    };
}

describe("ContextMenu keyboard navigation", () => {
    it("focuses the first menu item once opened", async () => {
        const { item } = renderMenu();

        await waitFor(() => {
            expect(document.activeElement).toBe(item("ruler"));
        });
    });

    it("moves focus with ArrowDown and wraps at the end", async () => {
        const user = userEvent.setup();
        const { item } = renderMenu();

        await waitFor(() => {
            expect(document.activeElement).toBe(item("ruler"));
        });

        await user.keyboard("{ArrowDown}");
        expect(document.activeElement).toBe(item("area"));

        await user.keyboard("{End}");
        await user.keyboard("{ArrowDown}");
        expect(document.activeElement).toBe(item("ruler"));
    });

    it("moves focus with ArrowUp and wraps at the start", async () => {
        const user = userEvent.setup();
        const { item } = renderMenu();

        await waitFor(() => {
            expect(document.activeElement).toBe(item("ruler"));
        });

        await user.keyboard("{ArrowUp}");
        expect(document.activeElement).toBe(item("volume"));

        await user.keyboard("{Home}");
        expect(document.activeElement).toBe(item("ruler"));
    });

    it("closes on Escape", async () => {
        const user = userEvent.setup();
        const { onClose } = renderMenu();

        await user.keyboard("{Escape}");

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("marks the active tool with aria-current", () => {
        const { item } = renderMenu({ activeToolId: "area" });

        expect(item("area")).toHaveAttribute("aria-current", "true");
        expect(item("ruler")).not.toHaveAttribute("aria-current");
    });
});
