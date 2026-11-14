import type { ReactNode } from "react";
import type { Bbox } from "@core/lib/geo";
import type { Dictionary } from "../../types";

export type SortDirection = "asc" | "desc" | null;

/**
 * Keys of the core dictionary the table reads. The kit cannot name the core
 * dictionary's key union (`ui → lib` layer rule), so it declares exactly
 * what it consumes; `DataTableLabels` is the typed view built once at the
 * table root and passed down.
 */
export type DataTableKey =
    | "dataTable.attribute"
    | "dataTable.clearFilters"
    | "dataTable.filterColumn"
    | "dataTable.filters"
    | "dataTable.hide"
    | "dataTable.loading"
    | "dataTable.no"
    | "dataTable.noData"
    | "dataTable.noMatches"
    | "dataTable.nullValue"
    | "dataTable.retry"
    | "dataTable.rowNumber"
    | "dataTable.show"
    | "dataTable.value"
    | "dataTable.yes"
    | "dataTable.zoomToObject";

export type DataTableLabels = Record<DataTableKey, string>;

export type OnSortHandler = (
    column: string | null,
    direction: SortDirection,
) => Promise<void>;

export interface GeometryColumnConfig {
    /** Key in row containing the geometry (Bbox) */
    key: string;
    /** Callback when zoom button is clicked */
    onZoom: (bbox: Bbox) => void;
}

/**
 * Renders attribute values of one shape inside table cells. Structural
 * mirror of the contracts' `AttributeValueRenderer` — the kit cannot
 * import contracts, so the shape is restated here.
 */
export interface ValueRenderer {
    id: string;
    matches(value: unknown): boolean;
    renderCell(
        value: unknown,
        api: { open(): void; dict: Dictionary },
    ): ReactNode;
    /** Plain-text form used by filtering; falls back to the default formatting. */
    toText?(value: unknown): string;
}

export interface DataTableProps {
    rows: Record<string, unknown>[];
    columns?: string[];
    header?: string;
    totalRows?: number;
    loading?: boolean;
    fetchMore?: ((count: number) => void) | ((count: number) => Promise<void>);
    /** Base page size for calculating request granularity (default 50) */
    pageSize?: number;
    /** Current sort column (controlled from parent) */
    sortColumn?: string | null;
    /** Current sort direction (controlled from parent) */
    sortDirection?: SortDirection;
    /** Sort change handler — presence switches component to controlled mode */
    onSort?: OnSortHandler;
    /** Refresh handler (called when user clicks retry button) */
    onRefresh?: (() => void) | (() => Promise<void>);
    /** Optional geometry column config — adds a zoom-to-object button per row */
    geometryColumn?: GeometryColumnConfig;
    /** Value renderers, tried in order against cell values */
    valueRenderers?: readonly ValueRenderer[];
    /** Opens the viewer for a renderer's cell value */
    onOpenValue?: (rendererId: string, value: unknown) => void;
    /** Localization dictionary */
    dict: Dictionary;
}
