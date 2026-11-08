// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useRestoreFocus } from "./useRestoreFocus";

afterEach(() => {
    cleanup();
});

function Overlay({ open }: { readonly open: boolean }) {
    useRestoreFocus(open);
    return open ? <div data-testid="overlay" tabIndex={-1} /> : null;
}

describe("useRestoreFocus", () => {
    it("returns focus to the element active before opening", async () => {
        const trigger = document.createElement("button");
        document.body.appendChild(trigger);
        trigger.focus();

        const { rerender } = render(<Overlay open={false} />);
        rerender(<Overlay open={true} />);
        (screen.getByTestId("overlay") as HTMLElement).focus();
        rerender(<Overlay open={false} />);

        expect(document.activeElement).toBe(trigger);
        trigger.remove();
    });

    it("closing from the closed state leaves focus alone", () => {
        const { rerender } = render(<Overlay open={false} />);
        rerender(<Overlay open={false} />);

        expect(document.activeElement).toBe(document.body);
    });
});
