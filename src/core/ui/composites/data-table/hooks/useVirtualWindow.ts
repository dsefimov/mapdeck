import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    type RefObject,
} from "react";
import {
    BUFFER_SIZE,
    DEFAULT_CONTAINER_HEIGHT,
    PRELOAD_BUFFER_ROWS,
    ROW_HEIGHT,
} from "../constants";
import { logger } from "@core/lib/logger";

interface UseVirtualWindowOptions {
    rowCount: number;
    totalRows?: number | undefined;
    fetchMore?:
        | ((count: number) => void)
        | ((count: number) => Promise<void>)
        | undefined;
    loading: boolean;
    pageSize?: number;
}

interface UseVirtualWindowResult {
    containerRef: RefObject<HTMLDivElement | null>;
    handleScroll: () => void;
    startIndex: number;
    endIndex: number;
    topPaddingHeight: number;
    bottomPaddingHeight: number;
}

interface ViewportGeometry {
    scrollTop: number;
    containerHeight: number;
    rowHeight: number;
    rowCount: number;
    pageSize: number | undefined;
}

/** Rows to request, or null when the viewport does not reach past the loaded window. */
function fetchCount(view: ViewportGeometry): number | null {
    const visibleEndRow =
        Math.ceil((view.scrollTop + view.containerHeight) / view.rowHeight) +
        PRELOAD_BUFFER_ROWS;
    if (visibleEndRow <= view.rowCount) return null;
    const minPage = view.pageSize ?? 50;
    const shortage = Math.max(minPage, visibleEndRow - view.rowCount);
    return Math.ceil(shortage / minPage) * minPage;
}

/**
 * Manages virtual scroll state: tracks scroll position and container size,
 * computes the visible window indices, and triggers fetchMore when the
 * user scrolls near the end of loaded data.
 */
export function useVirtualWindow(
    options: UseVirtualWindowOptions,
): UseVirtualWindowResult {
    const { rowCount, totalRows, fetchMore, loading, pageSize } = options;
    const effectiveTotal = totalRows ?? rowCount;

    const containerRef = useRef<HTMLDivElement>(null);
    // "rowCount:totalRows" a fetch was already requested for — a server
    // that reports more rows than it delivers must not turn the effect
    // into a refetch loop; a total change unlocks a retry.
    const requestedFor = useRef<string | null>(null);
    const rowHeightMeasuredRef = useRef(false);
    const [rowHeight, setRowHeight] = useState(ROW_HEIGHT);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(
        DEFAULT_CONTAINER_HEIGHT,
    );

    // Rows size themselves from CSS — measure one real row and let it
    // drive every formula below; the constant is only the first-frame
    // fallback. The guard flag also keeps a later first-child spacer row
    // (present once the window is scrolled) from being measured instead.
    useLayoutEffect(() => {
        if (rowHeightMeasuredRef.current) return;
        const row = containerRef.current?.querySelector(
            "tbody tr:not([data-spacer])",
        );
        const height = row?.getBoundingClientRect().height ?? 0;
        if (height > 0) {
            rowHeightMeasuredRef.current = true;
            setRowHeight(height);
        }
    }, [rowCount]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerHeight(entry.contentRect.height);
            }
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const handleScroll = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        setScrollTop(el.scrollTop);
    }, []);

    useEffect(() => {
        if (!fetchMore || loading) return;
        if (rowCount >= effectiveTotal) return;
        if (requestedFor.current === `${rowCount}:${effectiveTotal}`) return;

        const count = fetchCount({
            scrollTop,
            containerHeight,
            rowHeight,
            rowCount,
            pageSize,
        });
        if (count === null) return;

        requestedFor.current = `${rowCount}:${effectiveTotal}`;
        void Promise.resolve(fetchMore(count)).catch((error: unknown) => {
            logger.warn("useVirtualWindow: fetchMore failed", error);
            // A failed fetch must not pin the guard: the next scroll
            // retries instead of silently running out of data.
            requestedFor.current = null;
        });
    }, [
        scrollTop,
        containerHeight,
        rowHeight,
        rowCount,
        effectiveTotal,
        loading,
        fetchMore,
        pageSize,
    ]);

    const rawStart = Math.floor(scrollTop / rowHeight);
    const startIndex = Math.max(0, rawStart - BUFFER_SIZE);
    const visibleCount =
        Math.ceil(containerHeight / rowHeight) + 2 * BUFFER_SIZE;
    const endIndex = Math.min(effectiveTotal, startIndex + visibleCount);
    const topPaddingHeight = startIndex * rowHeight;
    const bottomPaddingHeight =
        Math.max(0, effectiveTotal - endIndex) * rowHeight;

    // Reset scroll position when total shrinks below current viewport
    // (e.g., filter applied while scrolled deep into the list).
    useEffect(() => {
        const el = containerRef.current;
        if (!el || effectiveTotal === 0) return;
        const totalHeight = effectiveTotal * rowHeight;
        const maxScrollTop = Math.max(0, totalHeight - containerHeight);
        if (el.scrollTop > maxScrollTop) {
            el.scrollTop = 0;
            setScrollTop(0);
        }
    }, [effectiveTotal, containerHeight, rowHeight]);

    return {
        containerRef,
        handleScroll,
        startIndex,
        endIndex,
        topPaddingHeight,
        bottomPaddingHeight,
    };
}
