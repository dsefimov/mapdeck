import { observer } from "mobx-react-lite";
import React, { useState, useMemo, useRef, useLayoutEffect } from "react";
import {
    Responsive,
    WidthProvider,
    type Layout,
    type ResponsiveLayouts,
    type LayoutItem,
} from "react-grid-layout/legacy";
import { useRootStore } from "@core/framework/store";
import type { RootStore } from "@core/framework/store";
import { formatDict } from "@core/framework/i18n";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import styles from "./WidgetGrid.module.css";

const ResponsiveGridLayout = WidthProvider(Responsive);

/**
 * Threshold in grid units for edge snapping
 * When widget is within this distance from edge, it snaps
 */
const EDGE_SNAP_THRESHOLD = 1;

/**
 * Threshold in grid units for center alignment
 * Widget center must be within this distance from grid center
 */
const CENTER_SNAP_THRESHOLD = 3;

/**
 * Check if widget is near an edge and calculate snapped layout
 */
const calculateEdgeSnap = (
    item: LayoutItem,
    oldItem: LayoutItem,
    gridCols: number,
    gridRows: number,
): LayoutItem | null => {
    const newItem = { ...item };
    const snapResult = computeSnapPosition(
        newItem,
        oldItem,
        gridCols,
        gridRows,
    );

    if (snapResult.snapped) {
        Object.assign(newItem, snapResult.layout);
        return newItem;
    }

    return null;
};

interface SnapResult {
    layout: Partial<LayoutItem>;
    snapped: boolean;
}

const computeSnapPosition = (
    item: LayoutItem,
    oldItem: LayoutItem,
    gridCols: number,
    gridRows: number,
): SnapResult => {
    const rightEdgeSnap = trySnapToRightEdge(
        item,
        oldItem,
        gridCols,
        isCenteredVertically(item, gridCols, gridRows),
    );
    if (rightEdgeSnap) return rightEdgeSnap;

    const bottomEdgeSnap = trySnapToBottomEdge(
        item,
        oldItem,
        gridRows,
        isCenteredHorizontally(item, gridCols, gridRows),
    );
    if (bottomEdgeSnap) return bottomEdgeSnap;

    const leftEdgeSnap = trySnapToLeftEdge(
        item,
        oldItem,
        gridCols,
        isCenteredVertically(item, gridCols, gridRows),
    );
    if (leftEdgeSnap) return leftEdgeSnap;

    return (
        trySnapToTopEdge(
            item,
            oldItem,
            gridRows,
            isCenteredHorizontally(item, gridCols, gridRows),
        ) ?? { layout: {}, snapped: false }
    );
};

const isCenteredHorizontally = (
    item: LayoutItem,
    gridCols: number,
    _gridRows: number,
): boolean => {
    const gridCenterX = gridCols / 2;
    const widgetCenterX = item.x + item.w / 2;
    return Math.abs(widgetCenterX - gridCenterX) <= CENTER_SNAP_THRESHOLD;
};

const isCenteredVertically = (
    item: LayoutItem,
    _gridCols: number,
    gridRows: number,
): boolean => {
    const gridCenterY = gridRows / 2;
    const widgetCenterY = item.y + item.h / 2;
    return Math.abs(widgetCenterY - gridCenterY) <= CENTER_SNAP_THRESHOLD;
};

const trySnapToRightEdge = (
    item: LayoutItem,
    oldItem: LayoutItem,
    gridCols: number,
    centeredVertically: boolean,
): SnapResult | null => {
    const itemRight = item.x + item.w;
    const oldRight = oldItem.x + oldItem.w;
    if (
        itemRight >= gridCols - EDGE_SNAP_THRESHOLD &&
        centeredVertically &&
        (oldRight < gridCols - EDGE_SNAP_THRESHOLD ||
            Math.abs(itemRight - oldRight) > 0.5)
    ) {
        const newWidth = gridCols - item.x;
        if (Math.abs(newWidth - item.w) > 0.1) {
            return { layout: { w: newWidth }, snapped: true };
        }
    }
    return null;
};

const trySnapToBottomEdge = (
    item: LayoutItem,
    oldItem: LayoutItem,
    gridRows: number,
    centeredHorizontally: boolean,
): SnapResult | null => {
    const itemBottom = item.y + item.h;
    const oldBottom = oldItem.y + oldItem.h;
    if (
        itemBottom >= gridRows - EDGE_SNAP_THRESHOLD &&
        centeredHorizontally &&
        (oldBottom < gridRows - EDGE_SNAP_THRESHOLD ||
            Math.abs(itemBottom - oldBottom) > 0.5)
    ) {
        const newHeight = gridRows - item.y;
        if (Math.abs(newHeight - item.h) > 0.1) {
            return { layout: { h: newHeight }, snapped: true };
        }
    }
    return null;
};

const trySnapToLeftEdge = (
    item: LayoutItem,
    oldItem: LayoutItem,
    gridCols: number,
    centeredVertically: boolean,
): SnapResult | null => {
    if (
        item.x <= EDGE_SNAP_THRESHOLD &&
        centeredVertically &&
        (oldItem.x > EDGE_SNAP_THRESHOLD || Math.abs(item.x - oldItem.x) > 0.5)
    ) {
        const widthChange = oldItem.x - item.x;
        const newWidth = Math.min(item.w + widthChange, gridCols);
        if (Math.abs(newWidth - item.w) > 0.1) {
            return { layout: { x: 0, w: newWidth }, snapped: true };
        }
    }
    return null;
};

const trySnapToTopEdge = (
    item: LayoutItem,
    oldItem: LayoutItem,
    gridRows: number,
    centeredHorizontally: boolean,
): SnapResult | null => {
    if (
        item.y <= EDGE_SNAP_THRESHOLD &&
        centeredHorizontally &&
        (oldItem.y > EDGE_SNAP_THRESHOLD || Math.abs(item.y - oldItem.y) > 0.5)
    ) {
        const heightChange = oldItem.y - item.y;
        const newHeight = Math.min(item.h + heightChange, gridRows);
        if (Math.abs(newHeight - item.h) > 0.1) {
            return { layout: { y: 0, h: newHeight }, snapped: true };
        }
    }
    return null;
};

interface GridConfig {
    cols: number;
    rows: number;
    defaultWidth: number;
    defaultHeight: number;
}

interface GridLayoutConfig {
    margin: readonly [number, number];
    containerPadding: readonly [number, number];
    rows: number;
}

const calculateRowHeight = (
    containerHeight: number,
    layoutConfig: GridLayoutConfig,
): number => {
    const verticalMargin = layoutConfig.margin[1];
    const verticalPadding = layoutConfig.containerPadding[1];
    const totalMargins = (layoutConfig.rows - 1) * verticalMargin;
    const availableHeight =
        containerHeight - 2 * verticalPadding - totalMargins;
    return availableHeight / layoutConfig.rows;
};

interface EdgeProximity {
    nearTop: boolean;
    nearBottom: boolean;
    nearLeft: boolean;
    nearRight: boolean;
}

const computeEdgeProximity = (
    item: LayoutItem,
    gridCols: number,
    gridRows: number,
): EdgeProximity => {
    const centeredH = isCenteredHorizontally(item, gridCols, gridRows);
    const centeredV = isCenteredVertically(item, gridCols, gridRows);

    return {
        nearTop: item.y <= EDGE_SNAP_THRESHOLD && centeredH,
        nearBottom:
            gridRows - (item.y + item.h) <= EDGE_SNAP_THRESHOLD && centeredH,
        nearLeft: item.x <= EDGE_SNAP_THRESHOLD && centeredV,
        nearRight:
            gridCols - (item.x + item.w) <= EDGE_SNAP_THRESHOLD && centeredV,
    };
};

const createHorizontalSnapLayout = (
    item: LayoutItem,
    gridDims: { cols: number; rows: number },
    defaultHeight: number,
    nearTop: boolean,
): LayoutItem => {
    const layout: LayoutItem = { ...item, x: 0, w: gridDims.cols };
    layout.h = defaultHeight;
    layout.y = nearTop ? 0 : gridDims.rows - layout.h;
    return layout;
};

const createVerticalSnapLayout = (
    item: LayoutItem,
    gridDims: { cols: number; rows: number },
    defaultWidth: number,
    nearLeft: boolean,
): LayoutItem => {
    const layout: LayoutItem = { ...item, y: 0, h: gridDims.rows };
    layout.w = defaultWidth;
    layout.x = nearLeft ? 0 : gridDims.cols - layout.w;
    return layout;
};

const applyDragSnap = (
    newItem: LayoutItem,
    _oldItem: LayoutItem,
    gridConfig: GridConfig,
    store: RootStore,
): void => {
    const { cols: gridCols, rows: gridRows } = gridConfig;
    const proximity = computeEdgeProximity(newItem, gridCols, gridRows);

    let snappedLayout: LayoutItem | null = null;

    if (proximity.nearTop || proximity.nearBottom) {
        if (newItem.x > 0 || newItem.w < gridCols) {
            snappedLayout = createHorizontalSnapLayout(
                newItem,
                { cols: gridCols, rows: gridRows },
                gridConfig.defaultHeight,
                proximity.nearTop,
            );
        }
    } else if (proximity.nearLeft || proximity.nearRight) {
        if (newItem.y > 0 || newItem.h < gridRows) {
            snappedLayout = createVerticalSnapLayout(
                newItem,
                { cols: gridCols, rows: gridRows },
                gridConfig.defaultWidth,
                proximity.nearLeft,
            );
        }
    }

    if (snappedLayout) {
        setTimeout(() => {
            store.overlayStore.updateLayout(newItem.i, snappedLayout!);
        }, 0);
    }
};

const computeActiveEdgeZones = (
    newItem: LayoutItem,
    gridConfig: GridConfig,
): Set<string> => {
    const { cols: gridCols, rows: gridRows } = gridConfig;
    const proximity = computeEdgeProximity(newItem, gridCols, gridRows);
    const edges = new Set<string>();

    if (proximity.nearTop) edges.add("top");
    if (proximity.nearBottom) edges.add("bottom");

    if (!proximity.nearTop && !proximity.nearBottom) {
        if (proximity.nearLeft) edges.add("left");
        if (proximity.nearRight) edges.add("right");
    }

    return edges;
};

const WidgetGrid: () => React.ReactNode = observer(() => {
    const rootStore = useRootStore();
    const dict = rootStore.localeStore.t("core");
    const { openWidgets, gridConfig } = rootStore.overlayStore;

    const containerRef = useRef<HTMLDivElement>(null);
    const [rowHeight, setRowHeight] = useState(40);
    const [activeEdgeZones, setActiveEdgeZones] = useState<Set<string>>(
        new Set(),
    );

    useLayoutEffect(() => {
        if (openWidgets.length === 0) return;
        const container = containerRef.current;
        if (!container) return;

        const layoutConfig = {
            margin: gridConfig.margin,
            containerPadding: gridConfig.containerPadding,
            rows: gridConfig.rows,
        };

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setRowHeight(
                    calculateRowHeight(entry.contentRect.height, layoutConfig),
                );
            }
        });

        resizeObserver.observe(container);
        setRowHeight(calculateRowHeight(container.clientHeight, layoutConfig));

        return () => resizeObserver.disconnect();
    }, [gridConfig, openWidgets.length]);

    const edgeZones = useMemo(() => {
        if (activeEdgeZones.size === 0) return null;

        return (
            <div className={styles.edgeZones}>
                {activeEdgeZones.has("top") && (
                    <div
                        className={`${styles.edgeZone} ${styles.edgeZoneTop} ${styles.edgeZoneActive}`}
                        title={dict["widgetGrid.dragToTop"]}
                    />
                )}
                {activeEdgeZones.has("bottom") && (
                    <div
                        className={`${styles.edgeZone} ${styles.edgeZoneBottom} ${styles.edgeZoneActive}`}
                        title={dict["widgetGrid.dragToBottom"]}
                    />
                )}
                {activeEdgeZones.has("left") && (
                    <div
                        className={`${styles.edgeZone} ${styles.edgeZoneLeft} ${styles.edgeZoneActive}`}
                        title={dict["widgetGrid.dragToLeft"]}
                    />
                )}
                {activeEdgeZones.has("right") && (
                    <div
                        className={`${styles.edgeZone} ${styles.edgeZoneRight} ${styles.edgeZoneActive}`}
                        title={dict["widgetGrid.dragToRight"]}
                    />
                )}
            </div>
        );
    }, [activeEdgeZones, dict]);

    if (openWidgets.length === 0) {
        return null;
    }

    const handleLayoutChange = (
        layout: Layout,
        _layouts: ResponsiveLayouts<string>,
    ) => {
        rootStore.overlayStore.syncLayout(
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
            setTimeout(() => {
                rootStore.overlayStore.updateLayout(newItem.i, snappedLayout);
            }, 0);
        }
        setActiveEdgeZones(new Set());
    };

    const handleDragStop = (
        _layout: Layout,
        oldItem: LayoutItem | null,
        newItem: LayoutItem | null,
    ) => {
        if (!oldItem || !newItem) return;
        applyDragSnap(newItem, oldItem, gridConfig, rootStore);
        setActiveEdgeZones(new Set());
    };

    const handleDragStart = (
        _layout: Layout,
        _oldItem: LayoutItem | null,
        _newItem: LayoutItem | null,
    ) => {
        // Visual feedback placeholder
    };

    const handleDrag = (
        _layout: Layout,
        _oldItem: LayoutItem | null,
        newItem: LayoutItem | null,
    ) => {
        if (!newItem) return;
        setActiveEdgeZones(computeActiveEdgeZones(newItem, gridConfig));
    };

    const handleClose = (widgetId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        rootStore.overlayStore.closeWidget(widgetId);
    };

    const handleBringToFront = (widgetId: string) => {
        rootStore.overlayStore.bringToFront(widgetId);
    };

    return (
        <div className={styles.grid}>
            {edgeZones}
            <div ref={containerRef} className={styles.inner}>
                <ResponsiveGridLayout
                    className={styles.container!}
                    layouts={{
                        lg: rootStore.overlayStore.layoutItems as Layout,
                    }}
                    breakpoints={{ lg: 1200 }}
                    cols={{ lg: gridConfig.cols }}
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
                    onDragStart={handleDragStart}
                    onDrag={handleDrag}
                    isBounded={true}
                    useCSSTransforms={true}
                    preventCollision={false}
                    compactType={null}
                    allowOverlap={true}
                >
                    {openWidgets.map((widget) => {
                        const widgetInfo = rootStore.catalogStore.getWidgetById(
                            widget.id,
                        );
                        if (!widgetInfo) return null;

                        const WidgetComponent = widgetInfo.component;
                        const widgetDict = rootStore.localeStore.t(
                            widgetInfo.id,
                        );
                        const widgetName = widgetDict["widget.name"]!;

                        return (
                            <div
                                key={widget.id}
                                className={styles.window}
                                style={{ zIndex: widget.zIndex }}
                                data-grid={widget.layout}
                                onClick={() => handleBringToFront(widget.id)}
                            >
                                <div
                                    className={styles.windowHeader}
                                    title={formatDict(
                                        dict["widgetGrid.dragToMove"]!,
                                        { name: widgetName },
                                    )}
                                >
                                    <span className={styles.windowTitle}>
                                        {widgetName}
                                    </span>
                                    <button
                                        className={styles.windowClose}
                                        onClick={(e) =>
                                            handleClose(widget.id, e)
                                        }
                                        title={dict["widgetGrid.close"]}
                                        aria-label={formatDict(
                                            dict["widgetGrid.closeLabel"]!,
                                            { name: widgetName },
                                        )}
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className={styles.windowContent}>
                                    <WidgetComponent
                                        className={styles.windowComponent}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </ResponsiveGridLayout>
            </div>
        </div>
    );
});

export default WidgetGrid;
