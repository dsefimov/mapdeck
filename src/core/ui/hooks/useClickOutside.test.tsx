// @vitest-environment happy-dom
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useClickOutside } from "./useClickOutside";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

/** Minimal consumer: an inline handler, like the kit's real callers. */
function Probe({ handler }: { readonly handler: () => void }) {
    const ref = useRef<HTMLDivElement>(null);
    useClickOutside(ref, handler);
    return <div ref={ref} data-testid="watched" />;
}

interface ArrayProbeProps {
    readonly handler: () => void;
    readonly enabled?: boolean;
}

/** Array form with two watched nodes and one unwatched sibling. */
function ArrayProbe({ handler, enabled = true }: ArrayProbeProps) {
    const first = useRef<HTMLDivElement>(null);
    const second = useRef<HTMLDivElement>(null);
    useClickOutside([first, second], handler, enabled);
    return (
        <div>
            <div ref={first} data-testid="first" />
            <div ref={second} data-testid="second" />
            <div data-testid="other" />
        </div>
    );
}

function pointerdownOn(testId: string): void {
    screen.getByTestId(testId).dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
    );
}

function pointerdownOnDocument(): void {
    document.dispatchEvent(new PointerEvent("pointerdown"));
}

function pointerdownAdds(spy: ReturnType<typeof vi.spyOn>): number {
    return spy.mock.calls.filter(
        (call: unknown[]) => (call[0] as string) === "pointerdown",
    ).length;
}

describe("useClickOutside listener stability", () => {
    it("does not re-attach on re-renders with fresh inline handlers", () => {
        const addSpy = vi.spyOn(document, "addEventListener");
        const removeSpy = vi.spyOn(document, "removeEventListener");
        const first = vi.fn();
        const second = vi.fn();
        const { rerender } = render(<Probe handler={first} />);

        rerender(<Probe handler={() => second()} />);
        rerender(<Probe handler={() => second()} />);

        const pointerdowns = addSpy.mock.calls.filter(
            (call) => (call[0] as string) === "pointerdown",
        );
        expect(pointerdowns).toHaveLength(1);
        expect(removeSpy).not.toHaveBeenCalled();

        document.dispatchEvent(new PointerEvent("pointerdown"));
        expect(second).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();
    });
});

describe("useClickOutside inside/outside discrimination", () => {
    it("fires the handler for a pointerdown outside every watched node", () => {
        const handler = vi.fn();
        render(<ArrayProbe handler={handler} />);

        pointerdownOn("other");

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("suppresses the handler for a pointerdown inside any watched node", () => {
        const handler = vi.fn();
        render(<ArrayProbe handler={handler} />);

        pointerdownOn("first");
        pointerdownOn("second");

        expect(handler).not.toHaveBeenCalled();
    });

    it("treats a pointerdown on the document itself as outside", () => {
        const handler = vi.fn();
        render(<Probe handler={handler} />);

        pointerdownOnDocument();

        expect(handler).toHaveBeenCalledTimes(1);
    });
});

describe("useClickOutside enabled flag", () => {
    it("attaches no listener while disabled", () => {
        const addSpy = vi.spyOn(document, "addEventListener");
        const handler = vi.fn();

        render(<ArrayProbe handler={handler} enabled={false} />);

        expect(pointerdownAdds(addSpy)).toBe(0);
        pointerdownOnDocument();
        expect(handler).not.toHaveBeenCalled();
    });

    it("reattaches when enabled flips back on", () => {
        const handler = vi.fn();
        const { rerender } = render(
            <ArrayProbe handler={handler} enabled={false} />,
        );

        rerender(<ArrayProbe handler={handler} />);

        pointerdownOnDocument();
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

describe("useClickOutside unmount", () => {
    it("removes the listener on unmount", () => {
        const handler = vi.fn();
        const { unmount } = render(<Probe handler={handler} />);

        unmount();
        pointerdownOnDocument();

        expect(handler).not.toHaveBeenCalled();
    });
});
