// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { LayoutItem } from "react-grid-layout/legacy";
import { WidgetGrid } from "./WidgetGrid";
import type { WidgetGridInstance } from "./GridWindow";
import type { GridConfig } from "./snapGeometry";

// happy-dom has no ResizeObserver; the grid only needs it to exist.
class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const DICT: Record<string, string> = {
    "widgetGrid.dragToTop": "Растянуть до верхнего края",
    "widgetGrid.dragToBottom": "Растянуть до нижнего края",
    "widgetGrid.dragToLeft": "Растянуть до левого края",
    "widgetGrid.dragToRight": "Растянуть до правого края",
    "widgetGrid.dragToMove": "Перетащить «{name}»",
    "widgetGrid.closeLabel": "Закрыть «{name}»",
};

const GRID_CONFIG: GridConfig = {
    cols: 12,
    rows: 20,
    margin: [8, 8],
    containerPadding: [8, 8],
    defaultWidth: 3,
    defaultHeight: 4,
};

const WIDGET_NAMES: Record<string, string> = {
    "w-grid": "Слои",
    "w-fixed": "Компас",
    "w-auto": "Отчёт",
};

const widget = (
    id: string,
    over: Partial<WidgetGridInstance["definition"]> = {},
): WidgetGridInstance => ({
    id,
    zIndex: 1,
    layout: null,
    definition: {
        id,
        placement: "grid",
        component: ({ widgetId }) => <div>content of {widgetId}</div>,
        ...over,
    },
});

const WIDGETS = [
    widget("w-grid"),
    widget("w-fixed", { fixed: true }),
    widget("w-auto", { size: "auto" }),
];

const LAYOUT: LayoutItem[] = [
    { i: "w-grid", x: 0, y: 0, w: 4, h: 5 },
    { i: "w-fixed", x: 5, y: 0, w: 3, h: 4, static: true },
    { i: "w-auto", x: 9, y: 0, w: 3, h: 3 },
];

function renderGrid() {
    const onUpdateLayout = vi.fn<(id: string, item: LayoutItem) => void>();
    const onCloseWidget = vi.fn<(id: string) => void>();
    const onFocusWidget = vi.fn<(id: string) => void>();
    render(
        <WidgetGrid
            widgets={WIDGETS}
            layout={LAYOUT}
            gridConfig={GRID_CONFIG}
            onUpdateLayout={onUpdateLayout}
            onSyncLayout={vi.fn()}
            onCloseWidget={onCloseWidget}
            onFocusWidget={onFocusWidget}
            dict={DICT}
            getWidgetName={(id) => WIDGET_NAMES[id] ?? id}
        />,
    );
    return { onUpdateLayout, onCloseWidget, onFocusWidget };
}

describe("WidgetGrid smoke", () => {
    it("renders a window per grid widget with its name", () => {
        renderGrid();

        expect(screen.getByText("Слои")).toBeInTheDocument();
        expect(screen.getByText("Компас")).toBeInTheDocument();
        expect(screen.getByText("content of w-auto")).toBeInTheDocument();
        expect(screen.getByTitle("Перетащить «Слои»")).toBeInTheDocument();
    });

    it("closes the window through the close button without raising it", () => {
        const { onCloseWidget, onFocusWidget } = renderGrid();

        fireEvent.click(
            screen.getByRole("button", { name: "Закрыть «Слои»" }),
        );

        expect(onCloseWidget).toHaveBeenCalledWith("w-grid");
        expect(onFocusWidget).not.toHaveBeenCalled();
    });

    it("raises the window on a click inside it", () => {
        const { onFocusWidget } = renderGrid();

        fireEvent.click(screen.getByText("content of w-grid"));

        expect(onFocusWidget).toHaveBeenCalledWith("w-grid");
    });

    it("a fixed window is static and has no close control", () => {
        renderGrid();

        expect(
            screen.queryByRole("button", { name: "Закрыть «Компас»" }),
        ).toBeNull();
        expect(screen.getByTitle("Компас")).toBeInTheDocument();
        expect(
            screen.getByText("Компас").closest(".react-grid-item"),
        ).toHaveClass("static");
    });

    it("an auto-size window defers sizing while the container is unmeasured", () => {
        const { onUpdateLayout } = renderGrid();

        // happy-dom: the container reports zero width, so the measurer's
        // colWidth guard must hold: no bogus layout writes.
        expect(onUpdateLayout).not.toHaveBeenCalled();
        expect(screen.getByText("content of w-auto")).toBeInTheDocument();
    });
});
