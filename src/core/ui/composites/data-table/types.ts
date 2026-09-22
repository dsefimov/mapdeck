import type { Bbox } from "@core/lib/geo";

export type SortDirection = "asc" | "desc" | null;

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
    /** Localization dictionary */
    dict: Record<string, string>;
}
