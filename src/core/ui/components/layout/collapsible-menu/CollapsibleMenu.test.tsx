// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CollapsibleMenu } from "./CollapsibleMenu";

// The re-measure path is driven by ResizeObserver — capture its callback.
let observerCallback: (() => void) | null = null;

class ResizeObserverStub {
    constructor(callback: () => void) {
        observerCallback = callback;
    }
    observe(): void {}
    disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
    observerCallback = null;
    cleanup();
});

describe("CollapsibleMenu re-measure", () => {
    it("grows the clamp when the content grows while open", async () => {
        render(
            <CollapsibleMenu open>
                <button type="button">report</button>
            </CollapsibleMenu>,
        );
        const panel = screen.getByRole("menu");
        expect(panel.style.maxHeight).toBe("0px"); // happy-dom: scrollHeight 0

        // Async content arrives — scrollHeight jumps.
        Object.defineProperty(panel, "scrollHeight", { value: 250 });
        await act(async () => {
            observerCallback?.();
        });

        expect(panel.style.maxHeight).toBe("250px");
    });
});
