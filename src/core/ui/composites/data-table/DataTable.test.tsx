// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DataTable } from "./DataTable";

// useVirtualWindow observes the scroll container via ResizeObserver.
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
    "dataTable.rowNumber": "№",
    "dataTable.show": "Показать",
    "dataTable.hide": "Скрыть",
    "dataTable.filters": "фильтры",
    "dataTable.clearFilters": "Сбросить фильтры",
    "dataTable.noData": "Нет данных",
    "dataTable.retry": "Повторить",
    "dataTable.filterColumn": "Фильтр: {column}",
    "dataTable.yes": "Да",
    "dataTable.no": "Нет",
    "dataTable.nullValue": "—",
    "dataTable.zoomToObject": "Приблизить",
};

const ROWS = [
    { name: "bravo", points: 2 },
    { name: "alpha", points: 1 },
    { name: "charlie", points: 3 },
];

const renderTable = () =>
    render(
        <DataTable
            rows={ROWS}
            columns={["name", "points"]}
            dict={DICT}
        />,
    );

/** Text of the data rows in DOM order (spacer rows have no text). */
const rowTexts = () =>
    Array.from(document.querySelectorAll("tbody tr"))
        .map((tr) => (tr.textContent ?? "").trim())
        .filter((text) => text.length > 0);

const nameHeader = () => screen.getByRole("columnheader", { name: /name/ });

const sortByName = () =>
    fireEvent.click(within(nameHeader()).getByRole("button"));

describe("DataTable sort cycle", () => {
    it("unsorted by default: original order, no aria-sort", () => {
        renderTable();

        expect(rowTexts()[0]).toContain("bravo");
        expect(nameHeader()).not.toHaveAttribute("aria-sort");
    });

    it("cycles a column through asc → desc → reset", () => {
        renderTable();

        // First click — ascending.
        sortByName();
        expect(nameHeader()).toHaveAttribute("aria-sort", "ascending");
        expect(rowTexts()[0]).toContain("alpha");
        expect(rowTexts()[2]).toContain("charlie");

        // Second click — descending.
        sortByName();
        expect(nameHeader()).toHaveAttribute("aria-sort", "descending");
        expect(rowTexts()[0]).toContain("charlie");
        expect(rowTexts()[2]).toContain("alpha");

        // Third click — reset to the original order, sort inactive.
        sortByName();
        expect(nameHeader()).not.toHaveAttribute("aria-sort");
        expect(rowTexts()[0]).toContain("bravo");
        expect(rowTexts()[2]).toContain("charlie");
    });

    it("switching to another column starts it at ascending", () => {
        renderTable();

        sortByName();
        sortByName();
        expect(nameHeader()).toHaveAttribute("aria-sort", "descending");

        const pointsHeader = screen.getByRole("columnheader", {
            name: /points/,
        });
        fireEvent.click(within(pointsHeader).getByRole("button"));

        expect(nameHeader()).not.toHaveAttribute("aria-sort");
        expect(pointsHeader).toHaveAttribute("aria-sort", "ascending");
        expect(rowTexts()[0]).toContain("alpha");
    });
});
