// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ErrorBoundary } from "./ErrorBoundary";

afterEach(cleanup);

const DICT = {
    "error.renderTitle": "Something went wrong",
    "error.retry": "Retry",
};

// Module-level so the test can flip it between the crash and the retry —
// React's concurrent recovery re-renders a throwing component, so the
// throw must depend on external state, not on a render counter.
let shouldThrow = false;

function Bomb() {
    if (shouldThrow) throw new Error("boom");
    return <div>alive</div>;
}

describe("ErrorBoundary", () => {
    it("contains the crash and recovers through retry", () => {
        shouldThrow = true;
        render(
            <ErrorBoundary dict={DICT}>
                <Bomb />
            </ErrorBoundary>,
        );

        expect(screen.getByText("boom")).toBeInTheDocument();

        shouldThrow = false;
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));

        expect(screen.getByText("alive")).toBeInTheDocument();
    });

    it("a custom onRetry runs and the boundary still recovers", () => {
        shouldThrow = true;
        const onRetry = vi.fn();
        render(
            <ErrorBoundary dict={DICT} onRetry={onRetry}>
                <Bomb />
            </ErrorBoundary>,
        );

        shouldThrow = false;
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(screen.getByText("alive")).toBeInTheDocument();
    });
});
