// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { SortDirection } from "../types";
import { ColumnarHeaderRow } from "./ColumnarHeaderRow";
import { KvHeaderRow } from "./KvHeaderRow";

afterEach(cleanup);

const DICT: Record<string, string> = {
    "dataTable.filterColumn": "Filter {column}...",
    "dataTable.filterAttributes": "Filter attributes...",
    "dataTable.filterValues": "Filter values...",
};

interface ColumnarOverrides {
    sortColumn?: string | null;
    sortDirection?: SortDirection;
}

function renderColumnar({
    sortColumn = null,
    sortDirection = "asc",
}: ColumnarOverrides = {}) {
    render(
        <table>
            <thead>
                <ColumnarHeaderRow
                    columns={["name", "size"]}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={vi.fn()}
                    showFilters
                    filters={{}}
                    onFilterChange={vi.fn()}
                    dict={DICT}
                />
            </thead>
        </table>,
    );
}

function renderKv({
    sortColumn = null,
    sortDirection = "asc",
}: ColumnarOverrides = {}) {
    render(
        <table>
            <thead>
                <KvHeaderRow
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={vi.fn()}
                    showFilters
                    filters={{}}
                    onFilterChange={vi.fn()}
                    dict={DICT}
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
                        dict={DICT}
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
});

describe("KvHeaderRow sort headers", () => {
    it("renders keyboard-operable buttons for both columns", () => {
        renderKv();

        expect(
            screen.getByRole("button", { name: "Attribute" }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: "Value" }),
        ).toBeInTheDocument();
    });

    it("exposes aria-sort only on the active column", () => {
        renderKv({ sortColumn: "value", sortDirection: "desc" });

        expect(
            screen.getByRole("columnheader", { name: "Value" }),
        ).toHaveAttribute("aria-sort", "descending");
        expect(
            screen.getByRole("columnheader", { name: "Attribute" }),
        ).not.toHaveAttribute("aria-sort");
    });

    it("names filter inputs beyond the placeholder", () => {
        renderKv();

        expect(
            screen.getByRole("textbox", { name: "Filter attributes..." }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("textbox", { name: "Filter values..." }),
        ).toBeInTheDocument();
    });
});
