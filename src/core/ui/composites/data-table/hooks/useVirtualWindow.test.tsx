// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useVirtualWindow } from "./useVirtualWindow";
import { ROW_HEIGHT } from "../constants";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function Harness({
    rowCount,
    totalRows,
    fetchMore,
}: {
    readonly rowCount: number;
    readonly totalRows?: number;
    readonly fetchMore?: (count: number) => void;
}) {
    const { containerRef, handleScroll, startIndex, topPaddingHeight } =
        useVirtualWindow({
            rowCount,
            totalRows,
            fetchMore,
            loading: false,
        });
    return (
        <div
            ref={containerRef}
            data-testid="container"
            onScroll={handleScroll}
        >
            <table>
                <thead>
                    <tr>
                        <th>column</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>cell</td>
                    </tr>
                </tbody>
            </table>
            <div data-testid="state">
                {startIndex}:{topPaddingHeight}
            </div>
        </div>
    );
}

function scrollAndRead(top: number): { startIndex: number; topPad: number } {
    const container = screen.getByTestId("container");
    // A layout-less container clamps scrollTop to 0 — report the scroll
    // position through the getter instead.
    vi.spyOn(container, "scrollTop", "get").mockReturnValue(top);
    fireEvent.scroll(container);
    const parts = (screen.getByTestId("state").textContent ?? "").split(":");
    return { startIndex: Number(parts[0]), topPad: Number(parts[1]) };
}

function stubRowHeight(height: number): void {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
        height,
        width: 0,
        top: 0,
        left: 0,
        bottom: height,
        right: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    } as DOMRect);
}

describe("useVirtualWindow row height", () => {
    it("measures a rendered row and drives the window with it", () => {
        stubRowHeight(40);
        render(<Harness rowCount={1000} />);

        // floor(460 / 40) = 11, minus the buffer of 10 → start 1, pad 40.
        expect(scrollAndRead(460)).toEqual({ startIndex: 1, topPad: 40 });

        // Still the measured height once a spacer row leads the tbody —
        // the spacer must never be (re)measured.
        expect(scrollAndRead(800)).toEqual({ startIndex: 10, topPad: 400 });
    });

    it("falls back to the constant until a row renders with height", () => {
        // happy-dom lays out nothing: getBoundingClientRect is 0 and the
        // fallback stays in charge.
        render(<Harness rowCount={1000} />);

        // floor(460 / 35) = 13, minus the buffer of 10 → start 3, pad 105.
        expect(scrollAndRead(460)).toEqual({
            startIndex: 3,
            topPad: 3 * ROW_HEIGHT,
        });
    });
});

describe("useVirtualWindow fetchMore", () => {
    it("refetches when only totalRows changes", async () => {
        const fetchMore = vi.fn().mockResolvedValue(undefined);
        // Loaded rows equal the declared total — nothing to fetch.
        const view = render(
            <Harness rowCount={10} totalRows={10} fetchMore={fetchMore} />,
        );
        expect(fetchMore).not.toHaveBeenCalled();

        // A metadata refresh reveals more rows; every other dep is
        // unchanged — only the total moved. ceil(max(50, 101) / 50) · 50.
        view.rerender(
            <Harness rowCount={10} totalRows={100} fetchMore={fetchMore} />,
        );

        await vi.waitFor(() =>
            expect(fetchMore).toHaveBeenCalledWith(150),
        );
    });
});
