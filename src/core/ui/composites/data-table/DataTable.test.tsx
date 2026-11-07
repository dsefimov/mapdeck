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
    "dataTable.attribute": "attribute",
    "dataTable.value": "value",
    "dataTable.show": "Показать",
    "dataTable.hide": "Скрыть",
    "dataTable.filters": "фильтры",
    "dataTable.clearFilters": "Сбросить фильтры",
    "dataTable.noData": "Нет данных",
    "dataTable.noMatches": "Ничего не найдено",
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

const SHOW_FILTERS = "Показать фильтры";
const CLEAR_FILTERS = "Сбросить фильтры";
const NAME_FILTER_LABEL = "Фильтр: name";
const NO_MATCHES = "Ничего не найдено";
const NO_DATA = "Нет данных";

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

        sortByName();
        expect(nameHeader()).toHaveAttribute("aria-sort", "ascending");
        expect(rowTexts()[0]).toContain("alpha");
        expect(rowTexts()[2]).toContain("charlie");

        sortByName();
        expect(nameHeader()).toHaveAttribute("aria-sort", "descending");
        expect(rowTexts()[0]).toContain("charlie");
        expect(rowTexts()[2]).toContain("alpha");

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

describe("DataTable filter-to-zero", () => {
    const filterByName = (value: string) => {
        fireEvent.click(
            screen.getByRole("button", { name: SHOW_FILTERS }),
        );
        fireEvent.change(screen.getByLabelText(NAME_FILTER_LABEL), {
            target: { value },
        });
    };

    it("keeps the controls and shows a no-matches row instead of the table", () => {
        renderTable();
        filterByName("zzz");

        expect(
            screen.getByRole("button", { name: CLEAR_FILTERS }),
        ).toBeInTheDocument();
        expect(screen.getByLabelText(NAME_FILTER_LABEL)).toBeInTheDocument();
        expect(screen.getByText(NO_MATCHES)).toBeInTheDocument();
        expect(screen.queryByText(NO_DATA)).toBeNull();
    });

    it("clearing the filters restores the rows", () => {
        renderTable();
        filterByName("zzz");
        expect(screen.getByText(NO_MATCHES)).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole("button", { name: CLEAR_FILTERS }),
        );

        expect(screen.queryByText(NO_MATCHES)).toBeNull();
        expect(screen.getByText("bravo")).toBeInTheDocument();
    });

    it("empty input still shows the empty state", () => {
        render(
            <DataTable rows={[]} columns={["name", "points"]} dict={DICT} />,
        );

        expect(screen.getByText(NO_DATA)).toBeInTheDocument();
        expect(
            screen.queryByRole("button", { name: SHOW_FILTERS }),
        ).toBeNull();
    });

    it("a matching filter narrows the table without empty state", () => {
        renderTable();
        filterByName("alph");

        expect(screen.getByText("alpha")).toBeInTheDocument();
        expect(screen.queryByText("bravo")).toBeNull();
        expect(screen.queryByText(NO_MATCHES)).toBeNull();
    });
});

describe("DataTable key-value view", () => {
    const KV_ROWS = [
        { name: "bravo", points: 2, _bbox: [0, 0, 1, 1] },
        { name: "alpha", points: 10, _bbox: [0, 0, 1, 1] },
    ];

    function renderKvTable() {
        render(<DataTable rows={KV_ROWS} dict={DICT} />);
    }

    function filterBy(label: string, value: string) {
        fireEvent.click(
            screen.getByRole("button", { name: SHOW_FILTERS }),
        );
        fireEvent.change(screen.getByLabelText(label), {
            target: { value },
        });
    }

    it("flattens rows into attribute/value rows sorted by attribute", () => {
        renderKvTable();

        expect(
            screen.getByRole("columnheader", { name: "attribute" }),
        ).toBeInTheDocument();
        const texts = rowTexts();
        expect(texts[0]).toContain("name");
        expect(texts[2]).toContain("points");
    });

    it("the attribute filter matches attribute names", () => {
        renderKvTable();
        filterBy("Фильтр: attribute", "poin");

        expect(screen.getAllByText("points")).toHaveLength(2);
        expect(screen.queryByText("name")).toBeNull();
        expect(screen.queryByText(NO_MATCHES)).toBeNull();
    });

    it("the value filter matches formatted values", () => {
        renderKvTable();
        filterBy("Фильтр: value", "10");

        expect(screen.getByText("10")).toBeInTheDocument();
        expect(screen.queryByText("2")).toBeNull();
    });
});
