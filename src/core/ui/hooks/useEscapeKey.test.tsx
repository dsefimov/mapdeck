// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useEscapeKey } from "./useEscapeKey";

afterEach(cleanup);

const EscapeProbe = ({
    onEscape,
}: {
    onEscape: () => void;
}) => {
    useEscapeKey(onEscape);
    return null;
};

describe("useEscapeKey layering", () => {
    it("a press reaches only the topmost layer, then the one below", () => {
        const lower = vi.fn();
        const upper = vi.fn();

        const lowerTree = render(<EscapeProbe onEscape={lower} />);
        const upperTree = render(<EscapeProbe onEscape={upper} />);

        fireEvent.keyDown(window, { key: "Escape" });
        expect(upper).toHaveBeenCalledTimes(1);
        expect(lower).not.toHaveBeenCalled();

        upperTree.unmount();
        fireEvent.keyDown(window, { key: "Escape" });
        expect(lower).toHaveBeenCalledTimes(1);
        lowerTree.unmount();
    });

    it("ignores keys other than Escape", () => {
        const onEscape = vi.fn();
        render(<EscapeProbe onEscape={onEscape} />);

        fireEvent.keyDown(window, { key: "Enter" });
        expect(onEscape).not.toHaveBeenCalled();
    });
});
