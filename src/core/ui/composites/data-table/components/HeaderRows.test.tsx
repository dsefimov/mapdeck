// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { typedDict } from "@core/lib/text";
import type { DataTableKey, SortDirection } from "../types";
import { ColumnarHeaderRow } from "./ColumnarHeaderRow";

afterEach(cleanup);

const DICT: Record<string, string> = {
    "dataTable.rowNumber": "#",
    "dataTable.filterColumn": "Filter {column}...",
    "dataTable.attribute": "Attribute",
    "dataTable.value": "Value",
};

const LABELS = typedDict<DataTableKey>(DICT);

interface ColumnarOverrides {
    sortColumn?: string | null;
    sortDirection?: SortDirection;
    showRowNumbers?: boolean;
}

function renderColumnar({
    sortColumn = null,
    sortDirection = "asc",
    showRowNumbers = true,
}: ColumnarOverrides = {}) {
    render(
        <table>
            <thead>
                <ColumnarHeaderRow
                    columns={["name", "size"]}
                    showRowNumbers={showRowNumbers}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={vi.fn()}
                    showFilters
                    filters={{}}
                    onFilterChange={vi.fn()}
                    labels={LABELS}
                />
            </thead>
        </table>,
    );
}

describe("ColumnarHeaderRow sort headers", () => {
    it("renders a keyboard-operable button per column", () => {
        renderColumnar();

        expect(
            screen.getByRole("button", { name: "name" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "size" }),
        ).toBeInTheDocument();
    });

    it("activates sorting with Enter and Space", async () => {
        const user = userEvent.setup();
        const onSort = vi.fn();
        render(
            <table>
                <thead>
                    <ColumnarHeaderRow
                        columns={["name"]}
                        sortColumn={null}
                        sortDirection="asc"
                        onSort={onSort}
                        showFilters={false}
                        filters={{}}
                        onFilterChange={vi.fn()}
                        labels={LABELS}
                    />
                </thead>
            </table>,
        );

        const button = screen.getByRole("button", { name: "name" });
        button.focus();
        await user.keyboard("{Enter}");
        await user.keyboard(" ");

        expect(onSort).toHaveBeenCalledWith("name");
        expect(onSort).toHaveBeenCalledTimes(2);
    });

    it("exposes aria-sort only on the active column", () => {
        renderColumnar({ sortColumn: "name", sortDirection: "asc" });

        expect(
            screen.getByRole("columnheader", { name: "name" }),
        ).toHaveAttribute("aria-sort", "ascending");
        expect(
            screen.getByRole("columnheader", { name: "size" }),
        ).not.toHaveAttribute("aria-sort");
    });

    it("announces descending order", () => {
        renderColumnar({ sortColumn: "name", sortDirection: "desc" });

        expect(
            screen.getByRole("columnheader", { name: "name" }),
        ).toHaveAttribute("aria-sort", "descending");
    });

    it("names filter inputs beyond the placeholder", () => {
        renderColumnar();

        expect(
            screen.getByRole("textbox", { name: "Filter name..." }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("textbox", { name: "Filter size..." }),
        ).toBeInTheDocument();
    });

    it("omits the row-number column on request", () => {
        renderColumnar({ showRowNumbers: false });

        expect(screen.queryByText("#")).not.toBeInTheDocument();
    });
});
