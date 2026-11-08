import { useLayoutEffect, type RefObject } from "react";
import type { LayoutItem } from "react-grid-layout/legacy";
import type { GridConfig } from "./snapGeometry";

/** Auto-sized windows never collapse below this many grid units. */
const MIN_AUTO_SIZE_UNITS = 2;

interface AutoSizeParams {
    /** No-op while false: only `size: "auto"` windows measure themselves. */
    enabled: boolean;
    widgetId: string;
    layout: LayoutItem | null;
    rowHeight: number;
    gridConfig: GridConfig;
    containerRef: RefObject<HTMLDivElement | null>;
    headerRef: RefObject<HTMLDivElement | null>;
    contentRef: RefObject<HTMLDivElement | null>;
    onMeasure(widgetId: string, item: LayoutItem): void;
}

/**
 * Sizes an auto-size window to its content: measures the header and content
 * elements and reports the covering grid units through `onMeasure`. The
 * elements arrive as refs, so the measurement never walks the DOM by
 * structure or class name.
 */
export function useAutoSize({
    enabled,
    widgetId,
    layout,
    rowHeight,
    gridConfig,
    containerRef,
    headerRef,
    contentRef,
    onMeasure,
}: AutoSizeParams): void {
    useLayoutEffect(() => {
        if (!enabled) return;
        const headerEl = headerRef.current;
        const contentEl = contentRef.current;
        const container = containerRef.current;
        if (!headerEl || !contentEl || !container) return;

        const measure = () => {
            const colWidth =
                (container.clientWidth - gridConfig.containerPadding[0] * 2) /
                gridConfig.cols;
            if (colWidth <= 0 || rowHeight <= 0) return;

            const headerHeight = headerEl.getBoundingClientRect().height;
            const contentRect = contentEl.getBoundingClientRect();
            const newW = Math.max(
                MIN_AUTO_SIZE_UNITS,
                Math.ceil(contentRect.width / colWidth),
            );
            const newH = Math.max(
                MIN_AUTO_SIZE_UNITS,
                Math.ceil((headerHeight + contentRect.height) / rowHeight),
            );

            const current = layout;
            if (!current) return;
            if (
                Math.abs(current.w - newW) < 0.5 &&
                Math.abs(current.h - newH) < 0.5
            ) {
                return;
            }
            onMeasure(widgetId, { ...current, w: newW, h: newH });
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(contentEl);
        return () => observer.disconnect();
    }, [
        enabled,
        widgetId,
        layout,
        rowHeight,
        gridConfig,
        containerRef,
        headerRef,
        contentRef,
        onMeasure,
    ]);
}
