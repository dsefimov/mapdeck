import { useCallback, useReducer } from "react";
import type { SortDirection, OnSortHandler } from "../types";

interface SortState {
    column: string | null;
    direction: SortDirection;
}

/** Cycles: different column → asc; same + asc → desc; same + desc → reset. */
function sortReducer(state: SortState, column: string): SortState {
    if (state.column !== column) return { column, direction: "asc" };
    if (state.direction === "asc") return { column, direction: "desc" };
    if (state.direction === "desc") return { column: null, direction: null };
    return { column, direction: "asc" };
}

interface UseSortModeProps {
    sortColumn?: string | null;
    sortDirection?: SortDirection;
    onSort?: OnSortHandler;
}

interface UseSortModeResult {
    sortColumn: string | null;
    sortDirection: SortDirection;
    handleSort: (column: string) => void;
}

/**
 * Unified sort state for controlled (onSort provided) and uncontrolled modes.
 * Presence of onSort switches the component to controlled mode.
 */
export function useSortMode(props: UseSortModeProps): UseSortModeResult {
    const [internalState, dispatch] = useReducer(sortReducer, {
        column: null,
        direction: null,
    });

    const sortColumn = props.onSort
        ? (props.sortColumn ?? null)
        : internalState.column;
    const sortDirection = props.onSort
        ? (props.sortDirection ?? null)
        : internalState.direction;

    const handleSort = useCallback(
        async (column: string) => {
            if (props.onSort) {
                const next = sortReducer(
                    { column: sortColumn, direction: sortDirection },
                    column,
                );
                try {
                    await props.onSort(next.column, next.direction);
                } catch {
                    // Parent sort handler error is non-critical — ignore
                }
            } else {
                dispatch(column);
            }
        },
        [props.onSort, sortColumn, sortDirection],
    );

    return { sortColumn, sortDirection, handleSort };
}
