// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { Bbox } from "@core/lib/geo";
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
    "dataTable.selectRow": "Выбрать строку",
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

describe("DataTable value renderers", () => {
    const LINK_URL = "https://example.test";
    const LINK_VALUE = { kind: "link", url: LINK_URL };
    const onOpenValue = vi.fn();

    const linkRenderer = {
        id: "link",
        matches: (value: unknown) =>
            typeof value === "object" &&
            value !== null &&
            (value as Record<string, unknown>).kind === "link",
        renderCell: (
            value: unknown,
            api: { open(): void; dict: Record<string, string> },
        ) => (
            <button onClick={api.open}>
                {String((value as { url: string }).url)}
            </button>
        ),
        toText: (value: unknown) => `site ${(value as { url: string }).url}`,
    };

    it("renders matched values through the renderer and reports opens", async () => {
        render(
            <DataTable
                rows={[{ name: "alpha", site: LINK_VALUE }]}
                columns={["name", "site"]}
                valueRenderers={[linkRenderer]}
                onOpenValue={onOpenValue}
                dict={DICT}
            />,
        );

        await userEvent.click(
            screen.getByRole("button", { name: LINK_URL }),
        );
        expect(onOpenValue).toHaveBeenCalledWith("link", LINK_VALUE);
    });

    it("falls back to default formatting for unmatched values", () => {
        render(
            <DataTable
                rows={[{ name: "alpha", site: "plain string" }]}
                columns={["name", "site"]}
                valueRenderers={[linkRenderer]}
                dict={DICT}
            />,
        );

        expect(screen.getByText("plain string")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /example/ })).toBeNull();
    });

    it("renders renderer cells in the key-value view too", async () => {
        onOpenValue.mockClear();
        render(
            <DataTable
                rows={[{ site: LINK_VALUE }]}
                valueRenderers={[linkRenderer]}
                onOpenValue={onOpenValue}
                dict={DICT}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: LINK_URL }));
        expect(onOpenValue).toHaveBeenCalledWith("link", LINK_VALUE);
    });

    it("filters through the renderer's toText", () => {
        render(
            <DataTable
                rows={[{ site: LINK_VALUE }]}
                columns={["site"]}
                valueRenderers={[linkRenderer]}
                dict={DICT}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: SHOW_FILTERS }));
        fireEvent.change(screen.getByLabelText("Фильтр: site"), {
            target: { value: "site https" },
        });

        expect(
            screen.getByRole("button", { name: LINK_URL }),
        ).toBeInTheDocument();
    });
});

describe("DataTable row selection", () => {
    const selected = new Set<string>(["row-alpha"]);
    const onToggleRow = vi.fn();

    beforeEach(() => {
        selected.clear();
        selected.add("row-alpha");
        onToggleRow.mockClear();
    });

    const renderSelectable = () =>
        render(
            <DataTable
                rows={ROWS}
                columns={["name", "points"]}
                dict={DICT}
                selection={{
                    getRowId: (row, index) =>
                        `row-${String(row.name ?? index)}`,
                    isSelected: (rowId) => selected.has(rowId),
                    onToggleRow,
                }}
            />,
        );

    it("renders a checkbox column and marks selected rows", () => {
        renderSelectable();

        const boxes = screen.getAllByRole("checkbox", {
            name: "Выбрать строку",
        });
        expect(boxes).toHaveLength(ROWS.length);
        expect(boxes[1]).toBeChecked();
        expect(boxes[0]).not.toBeChecked();
    });

    it("toggles a row from its checkbox and from a plain row click", async () => {
        renderSelectable();

        const checkbox = screen.getAllByRole("checkbox").at(0);
        expect(checkbox).toBeDefined();
        await userEvent.click(checkbox!);
        // The checkbox path fires exactly one toggle — the row-click
        // guard must not double-fire through the bubbling click.
        expect(onToggleRow).toHaveBeenCalledTimes(1);
        expect(onToggleRow).toHaveBeenCalledWith(ROWS[0]);

        fireEvent.click(
            screen.getByRole("row", {
                name: /charlie/,
            }),
        );
        expect(onToggleRow).toHaveBeenCalledWith(ROWS[2]);
    });

    it("keys id-less rows by source index — sorting keeps the selection on its row", async () => {
        const indexSelected = new Set<string>(["row-0"]);
        render(
            <DataTable
                rows={ROWS}
                columns={["name", "points"]}
                dict={DICT}
                selection={{
                    getRowId: (_row, index) => `row-${index}`,
                    isSelected: (rowId) => indexSelected.has(rowId),
                    onToggleRow: () => undefined,
                }}
            />,
        );
        // Source row 0 is bravo; it starts checked.
        expect(
            screen.getByRole("row", { name: /bravo/ }).querySelector("input"),
        ).toBeChecked();

        sortByName();

        // After the client-side sort, bravo is last — still the checked one.
        expect(
            screen.getByRole("row", { name: /bravo/ }).querySelector("input"),
        ).toBeChecked();
        expect(
            screen.getByRole("row", { name: /alpha/ }).querySelector("input"),
        ).not.toBeChecked();
    });

    it("keeps a row click on an interactive cell out of the toggle", () => {
        const zoom = vi.fn();
        const toggle = vi.fn();
        render(
            <DataTable
                rows={[{ ...ROWS[0], bbox: new Bbox([0, 0, 1, 1]) }]}
                columns={["name", "points"]}
                dict={DICT}
                geometryColumn={{ key: "bbox", onZoom: zoom }}
                selection={{
                    getRowId: (row, index) =>
                        `row-${String(row.name ?? index)}`,
                    isSelected: () => false,
                    onToggleRow: toggle,
                }}
            />,
        );

        const zoomButton = screen
            .getAllByRole("button", { name: "Приблизить" })
            .at(0);
        expect(zoomButton).toBeDefined();
        fireEvent.click(zoomButton!);
        expect(zoom).toHaveBeenCalled();
        expect(toggle).not.toHaveBeenCalled();
    });

    it("renders the checkbox column before the zoom column", () => {
        render(
            <DataTable
                rows={[{ ...ROWS[0], bbox: new Bbox([0, 0, 1, 1]) }]}
                columns={["name", "points"]}
                dict={DICT}
                geometryColumn={{
                    key: "bbox",
                    onZoom: () => undefined,
                }}
                selection={{
                    getRowId: (row, index) =>
                        `row-${String(row.name ?? index)}`,
                    isSelected: () => false,
                    onToggleRow: () => undefined,
                }}
            />,
        );

        const cells = Array.from(
            screen.getByRole("row", { name: /bravo/ }).querySelectorAll("td"),
        );
        const checkboxCell = cells.findIndex((cell) =>
            cell.querySelector("input[type=checkbox]"),
        );
        const zoomCell = cells.findIndex((cell) =>
            cell.querySelector("button"),
        );
        expect(checkboxCell).toBeGreaterThanOrEqual(0);
        expect(zoomCell).toBeGreaterThan(checkboxCell);
    });

    it("toggles from the checkbox without zooming", async () => {
        const zoom = vi.fn();
        const toggle = vi.fn();
        render(
            <DataTable
                rows={[{ ...ROWS[0], bbox: new Bbox([0, 0, 1, 1]) }]}
                columns={["name", "points"]}
                dict={DICT}
                geometryColumn={{ key: "bbox", onZoom: zoom }}
                selection={{
                    getRowId: (row, index) =>
                        `row-${String(row.name ?? index)}`,
                    isSelected: () => false,
                    onToggleRow: toggle,
                }}
            />,
        );

        const checkbox = screen.getAllByRole("checkbox").at(0);
        expect(checkbox).toBeDefined();
        await userEvent.click(checkbox!);

        expect(toggle).toHaveBeenCalledWith(
            expect.objectContaining({ name: "bravo" }),
        );
        expect(zoom).not.toHaveBeenCalled();
    });

    it("pins selected rows to the top, keeping the order within groups", () => {
        const { rerender } = renderSelectable();
        expect(rowTexts()[0]).toContain("bravo");

        rerender(
            <DataTable
                rows={ROWS}
                columns={["name", "points"]}
                dict={DICT}
                selection={{
                    getRowId: (row, index) =>
                        `row-${String(row.name ?? index)}`,
                    isSelected: (rowId) => selected.has(rowId),
                    onToggleRow,
                    pinSelectedToTop: true,
                }}
            />,
        );

        const texts = rowTexts();
        expect(texts[0]).toContain("alpha");
        expect(texts[1]).toContain("bravo");
        expect(texts[2]).toContain("charlie");
    });

    it("renders host controls in the filters row", () => {
        render(
            <DataTable
                rows={ROWS}
                columns={["name", "points"]}
                dict={DICT}
                controls={<button type="button">Host view</button>}
            />,
        );

        const hostButton = screen.getByRole("button", { name: "Host view" });
        const controlsRow = hostButton.closest("div");
        expect(controlsRow?.textContent).toContain(SHOW_FILTERS);
    });
});
