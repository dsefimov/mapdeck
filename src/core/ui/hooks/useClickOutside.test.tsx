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
    readonly defer?: boolean;
}

/** Array form with two watched nodes and one unwatched sibling. */
function ArrayProbe({ handler, enabled = true, defer = false }: ArrayProbeProps) {
    const first = useRef<HTMLDivElement>(null);
    const second = useRef<HTMLDivElement>(null);
    useClickOutside([first, second], handler, enabled, { defer });
    return (
        <div>
            <div ref={first} data-testid="first" />
            <div ref={second} data-testid="second" />
            <div data-testid="other" />
        </div>
    );
}

function mousedownOn(testId: string): void {
    screen.getByTestId(testId).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
    );
}

function mousedownOnDocument(): void {
    document.dispatchEvent(new MouseEvent("mousedown"));
}

function mousedownAdds(spy: ReturnType<typeof vi.spyOn>): number {
    return spy.mock.calls.filter(
        (call: unknown[]) => (call[0] as string) === "mousedown",
    ).length;
}

async function nextTick(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
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

        const mousedowns = addSpy.mock.calls.filter(
            (call) => (call[0] as string) === "mousedown",
        );
        expect(mousedowns).toHaveLength(1);
        expect(removeSpy).not.toHaveBeenCalled();

        document.dispatchEvent(new MouseEvent("mousedown"));
        expect(second).toHaveBeenCalledTimes(1);
        expect(first).not.toHaveBeenCalled();
    });
});

describe("useClickOutside inside/outside discrimination", () => {
    it("fires the handler for a mousedown outside every watched node", () => {
        const handler = vi.fn();
        render(<ArrayProbe handler={handler} />);

        mousedownOn("other");

        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("suppresses the handler for a mousedown inside any watched node", () => {
        const handler = vi.fn();
        render(<ArrayProbe handler={handler} />);

        mousedownOn("first");
        mousedownOn("second");

        expect(handler).not.toHaveBeenCalled();
    });

    it("treats a mousedown on the document itself as outside", () => {
        const handler = vi.fn();
        render(<Probe handler={handler} />);

        mousedownOnDocument();

        expect(handler).toHaveBeenCalledTimes(1);
    });
});

describe("useClickOutside enabled flag", () => {
    it("attaches no listener while disabled", () => {
        const addSpy = vi.spyOn(document, "addEventListener");
        const handler = vi.fn();

        render(<ArrayProbe handler={handler} enabled={false} />);

        expect(mousedownAdds(addSpy)).toBe(0);
        mousedownOnDocument();
        expect(handler).not.toHaveBeenCalled();
    });

    it("reattaches when enabled flips back on", () => {
        const handler = vi.fn();
        const { rerender } = render(
            <ArrayProbe handler={handler} enabled={false} />,
        );

        rerender(<ArrayProbe handler={handler} />);

        mousedownOnDocument();
        expect(handler).toHaveBeenCalledTimes(1);
    });
});

describe("useClickOutside defer option", () => {
    it("defers attachment by one tick", async () => {
        const addSpy = vi.spyOn(document, "addEventListener");
        const handler = vi.fn();

        render(<ArrayProbe handler={handler} defer />);
        expect(mousedownAdds(addSpy)).toBe(0);

        await nextTick();
        expect(mousedownAdds(addSpy)).toBe(1);

        mousedownOn("other");
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it("unmount within the defer window cancels the attachment", async () => {
        const addSpy = vi.spyOn(document, "addEventListener");
        const handler = vi.fn();

        const { unmount } = render(<ArrayProbe handler={handler} defer />);
        unmount();
        await nextTick();

        expect(mousedownAdds(addSpy)).toBe(0);
        mousedownOnDocument();
        expect(handler).not.toHaveBeenCalled();
    });
});

describe("useClickOutside unmount", () => {
    it("removes the listener on unmount", () => {
        const handler = vi.fn();
        const { unmount } = render(<Probe handler={handler} />);

        unmount();
        mousedownOnDocument();

        expect(handler).not.toHaveBeenCalled();
    });
});
