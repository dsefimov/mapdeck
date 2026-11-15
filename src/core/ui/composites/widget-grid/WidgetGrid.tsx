import React, {
    useState,
    useRef,
    useCallback,
    useEffect,
    useLayoutEffect,
} from "react";
import {
    Responsive,
    WidthProvider,
    type Layout,
    type LayoutItem,
} from "react-grid-layout/legacy";
import { typedDict } from "@core/lib/text";
import type { Dictionary } from "../../types";
import { cn } from "../../utils/cn";
import {
    applyDragSnap,
    calculateEdgeSnap,
    calculateRowHeight,
    computeActiveEdgeZones,
    EDGE_ZONES,
    type EdgeZone,
    type GridConfig,
} from "./snapGeometry";
import { GridWindow, type WidgetGridInstance } from "./GridWindow";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import styles from "./WidgetGrid.module.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

/**
 * The only responsive breakpoint: layouts and cols exist for "lg" alone, so
 * this number is the always-lg sentinel react-grid-layout needs to switch
 * from the default "md" bucket.
 */
const GRID_BREAKPOINT_LG = 1200;

/**
 * Core-namespace keys the grid chrome reads. The kit cannot name the core
 * dictionary's key union (`ui → lib` layer rule), so it declares exactly
 * what it consumes and types the view itself.
 */
type WidgetGridKey =
    | "widgetGrid.dragToTop"
    | "widgetGrid.dragToBottom"
    | "widgetGrid.dragToLeft"
    | "widgetGrid.dragToRight"
    | "widgetGrid.dragToMove"
    | "widgetGrid.closeLabel";

const EDGE_ZONE_TITLE: Record<EdgeZone, WidgetGridKey> = {
    top: "widgetGrid.dragToTop",
    bottom: "widgetGrid.dragToBottom",
    left: "widgetGrid.dragToLeft",
    right: "widgetGrid.dragToRight",
};

export interface WidgetGridProps {
    /** Open widget instances; only `placement: "grid"` ones render here. */
    widgets: readonly WidgetGridInstance[];
    /** Current grid layout, one item per widget. */
    layout: readonly LayoutItem[];
    gridConfig: GridConfig;
    /** Adopts one item's geometry (snap corrections, auto-size measurement). */
    onUpdateLayout(widgetId: string, item: LayoutItem): void;
    /** Full-layout sync after react-grid-layout finishes a change. */
    onSyncLayout(items: LayoutItem[]): void;
    onCloseWidget(widgetId: string): void;
    onFocusWidget(widgetId: string): void;
    /** Core dictionary for the grid's own chrome strings. */
    dict: Dictionary;
    /** Localized display name of a widget by its id. */
    getWidgetName: (widgetId: string) => string;
}

export const WidgetGrid: (props: WidgetGridProps) => React.ReactNode = ({
    widgets,
    layout,
    gridConfig,
    onUpdateLayout,
    onSyncLayout,
    onCloseWidget,
    onFocusWidget,
    dict,
    getWidgetName,
}) => {
    const gridDict = typedDict<WidgetGridKey>(dict);

    const gridWidgets = widgets.filter(
        (widget) => (widget.definition.placement ?? "grid") === "grid",
    );

    const containerRef = useRef<HTMLDivElement>(null);
    const [rowHeight, setRowHeight] = useState(40);
    const [activeEdgeKey, setActiveEdgeKey] = useState("");

    // Snap corrections are written one macrotask after RGL's stop
    // handlers: RGL is still committing its internal state in that
    // event, and a synchronous observable write re-enters it
    // mid-commit. Timers are tracked so teardown cancels stragglers.
    const pendingLayoutTimers = useRef<Set<number>>(new Set());
    useEffect(() => {
        const timers = pendingLayoutTimers.current;
        return () => {
            for (const timer of timers) window.clearTimeout(timer);
            timers.clear();
        };
    }, []);
    const scheduleLayoutUpdate = useCallback(
        (item: LayoutItem) => {
            const timer = window.setTimeout(() => {
                pendingLayoutTimers.current.delete(timer);
                onUpdateLayout(item.i, item);
            }, 0);
            pendingLayoutTimers.current.add(timer);
        },
        [onUpdateLayout],
    );

    useLayoutEffect(() => {
        if (gridWidgets.length === 0) return;
        const container = containerRef.current;
        if (!container) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setRowHeight(calculateRowHeight(entry.contentRect.height, gridConfig));
            }
        });

        resizeObserver.observe(container);
        setRowHeight(calculateRowHeight(container.clientHeight, gridConfig));

        return () => resizeObserver.disconnect();
    }, [gridConfig, gridWidgets.length]);

    if (gridWidgets.length === 0) {
        return null;
    }

    const handleLayoutChange = (layout: Layout) => {
        onSyncLayout(
            layout.map((item) => ({
                i: item.i,
                x: item.x,
                y: item.y,
                w: item.w,
                h: item.h,
            })),
        );
    };

    const handleResizeStop = (
        _layout: Layout,
        oldItem: LayoutItem | null,
        newItem: LayoutItem | null,
    ) => {
        if (!oldItem || !newItem) return;

        const snappedLayout = calculateEdgeSnap(
            newItem,
            oldItem,
            gridConfig.cols,
            gridConfig.rows,
        );

        if (snappedLayout) {
            scheduleLayoutUpdate(snappedLayout);
        }
        setActiveEdgeKey("");
    };

    const handleDragStop = (
        _layout: Layout,
        _oldItem: LayoutItem | null,
        newItem: LayoutItem | null,
    ) => {
        if (!newItem) return;
        const snappedLayout = applyDragSnap(newItem, gridConfig);
        if (snappedLayout) {
            scheduleLayoutUpdate(snappedLayout);
        }
        setActiveEdgeKey("");
    };

    const handleDrag = (
        _layout: Layout,
        _oldItem: LayoutItem | null,
        newItem: LayoutItem | null,
    ) => {
        if (!newItem) return;
        const zones = computeActiveEdgeZones(newItem, gridConfig);
        setActiveEdgeKey(
            EDGE_ZONES.filter((zone) => zones.has(zone)).join(" "),
        );
    };

    const activeEdges = new Set(activeEdgeKey.split(" ").filter(Boolean));

    return (
        <div className={styles.grid}>
            {activeEdges.size > 0 && (
                <div className={styles.edgeZones}>
                    {EDGE_ZONES.filter((zone) => activeEdges.has(zone)).map(
                        (zone) => (
                            <div
                                key={zone}
                                data-edge={zone}
                                className={styles.edgeZone}
                                title={gridDict[EDGE_ZONE_TITLE[zone]]}
                            />
                        ),
                    )}
                </div>
            )}
            <div ref={containerRef} className={styles.inner}>
                <ResponsiveGridLayout
                    className={cn(styles.container)}
                    layouts={{ lg: layout }}
                    breakpoints={{ lg: GRID_BREAKPOINT_LG }}
                    cols={{ lg: gridConfig.cols }}
                    maxRows={gridConfig.rows}
                    rowHeight={rowHeight}
                    margin={gridConfig.margin}
                    containerPadding={gridConfig.containerPadding}
                    isDraggable={true}
                    isResizable={true}
                    resizeHandles={["se"]}
                    draggableHandle={`.${styles.windowHeader}`}
                    onLayoutChange={handleLayoutChange}
                    onResizeStop={handleResizeStop}
                    onDragStop={handleDragStop}
                    onDrag={handleDrag}
                    isBounded={true}
                    useCSSTransforms={true}
                    preventCollision={false}
                    compactType={null}
                    allowOverlap={true}
                >
                    {gridWidgets.map((widget) => (
                        <GridWindow
                            key={widget.id}
                            widget={widget}
                            dict={gridDict}
                            getWidgetName={getWidgetName}
                            rowHeight={rowHeight}
                            gridConfig={gridConfig}
                            containerRef={containerRef}
                            onUpdateLayout={onUpdateLayout}
                            onCloseWidget={onCloseWidget}
                            onFocusWidget={onFocusWidget}
                        />
                    ))}
                </ResponsiveGridLayout>
            </div>
        </div>
    );
};
