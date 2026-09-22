/**
 * Pure snap geometry of the widget grid: edge snapping while dragging and
 * resizing, active edge-zone detection, and row-height math. No React, no
 * stores — layout arithmetic over react-grid-layout items only.
 */
import type { LayoutItem } from "react-grid-layout/legacy";

/** Threshold in grid units for edge snapping. */
const EDGE_SNAP_THRESHOLD = 1;

/** Threshold in grid units for center alignment. */
const CENTER_SNAP_THRESHOLD = 3;

/** Grid dimensions the snap math needs. */
export interface GridConfig {
    cols: number;
    rows: number;
    defaultWidth: number;
    defaultHeight: number;
}

/** Container geometry for row-height computation. */
export interface GridLayoutConfig {
    margin: readonly [number, number];
    containerPadding: readonly [number, number];
    rows: number;
}

export interface SnapResult {
    layout: Partial<LayoutItem>;
    snapped: boolean;
}

/** Row height that fits `rows` rows into the container height. */
export const calculateRowHeight = (
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

const isCenteredHorizontally = (
    item: LayoutItem,
    gridCols: number,
): boolean => {
    const gridCenterX = gridCols / 2;
    const widgetCenterX = item.x + item.w / 2;
    return Math.abs(widgetCenterX - gridCenterX) <= CENTER_SNAP_THRESHOLD;
};

const isCenteredVertically = (
    item: LayoutItem,
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
        isCenteredVertically(item, gridRows),
    );
    if (rightEdgeSnap) return rightEdgeSnap;

    const bottomEdgeSnap = trySnapToBottomEdge(
        item,
        oldItem,
        gridRows,
        isCenteredHorizontally(item, gridCols),
    );
    if (bottomEdgeSnap) return bottomEdgeSnap;

    const leftEdgeSnap = trySnapToLeftEdge(
        item,
        oldItem,
        gridCols,
        isCenteredVertically(item, gridRows),
    );
    if (leftEdgeSnap) return leftEdgeSnap;

    return (
        trySnapToTopEdge(
            item,
            oldItem,
            gridRows,
            isCenteredHorizontally(item, gridCols),
        ) ?? { layout: {}, snapped: false }
    );
};

/**
 * Resize-stop snap: when the resized widget hugs an edge (while centered on
 * the cross axis), stretch it exactly to that edge. Null when no snap applies.
 */
export const calculateEdgeSnap = (
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
    const centeredH = isCenteredHorizontally(item, gridCols);
    const centeredV = isCenteredVertically(item, gridRows);

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

/**
 * Drag-stop snap: a widget dropped near the top/bottom edge (while centered
 * horizontally) becomes a full-width band; near left/right — a full-height
 * band. Null when no snap applies.
 */
export const applyDragSnap = (
    newItem: LayoutItem,
    gridConfig: GridConfig,
): LayoutItem | null => {
    const { cols: gridCols, rows: gridRows } = gridConfig;
    const proximity = computeEdgeProximity(newItem, gridCols, gridRows);

    if (proximity.nearTop || proximity.nearBottom) {
        if (newItem.x > 0 || newItem.w < gridCols) {
            return createHorizontalSnapLayout(
                newItem,
                { cols: gridCols, rows: gridRows },
                gridConfig.defaultHeight,
                proximity.nearTop,
            );
        }
    } else if (proximity.nearLeft || proximity.nearRight) {
        if (newItem.y > 0 || newItem.h < gridRows) {
            return createVerticalSnapLayout(
                newItem,
                { cols: gridCols, rows: gridRows },
                gridConfig.defaultWidth,
                proximity.nearLeft,
            );
        }
    }

    return null;
};

/** Edge zones highlighted while dragging near an edge. */
export const computeActiveEdgeZones = (
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
