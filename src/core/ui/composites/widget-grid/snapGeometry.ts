/**
 * Pure snap geometry of the widget grid: edge snapping while dragging and
 * resizing, active edge-zone detection, and row-height math. No React, no
 * stores — layout arithmetic over react-grid-layout items only.
 */
import type { LayoutItem } from "react-grid-layout/legacy";

/** Threshold in grid units for edge snapping. */
const EDGE_SNAP_THRESHOLD = 1;

/** Tolerance in grid units for "the widget sits on the grid's cross-axis center". */
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

/** One axis of the grid: which coordinates it uses and where it ends. */
interface SnapAxis {
    pos: "x" | "y";
    size: "w" | "h";
    limit: number;
}

/**
 * Resize-stop snap toward the far edge of an axis: a widget whose far edge
 * reaches the grid limit (while near the cross-axis center) is stretched
 * exactly to the limit. Only the "se" handle is enabled
 * (`resizeHandles={["se"]}`), so the near edges never move during a resize
 * and near-edge snaps cannot occur.
 */
function snapToFarEdge(
    item: LayoutItem,
    oldItem: LayoutItem,
    axis: SnapAxis,
    nearCrossCenter: boolean,
): Partial<LayoutItem> | null {
    const edge = item[axis.pos] + item[axis.size];
    const oldEdge = oldItem[axis.pos] + oldItem[axis.size];
    if (
        edge >= axis.limit - EDGE_SNAP_THRESHOLD &&
        nearCrossCenter &&
        (oldEdge < axis.limit - EDGE_SNAP_THRESHOLD ||
            Math.abs(edge - oldEdge) > 0.5)
    ) {
        const stretched = axis.limit - item[axis.pos];
        if (Math.abs(stretched - item[axis.size]) > 0.1) {
            return { [axis.size]: stretched } as Partial<LayoutItem>;
        }
    }
    return null;
}

const isNearGridCenterX = (item: LayoutItem, gridCols: number): boolean => {
    const widgetCenterX = item.x + item.w / 2;
    return Math.abs(widgetCenterX - gridCols / 2) <= CENTER_SNAP_THRESHOLD;
};

const isNearGridCenterY = (item: LayoutItem, gridRows: number): boolean => {
    const widgetCenterY = item.y + item.h / 2;
    return Math.abs(widgetCenterY - gridRows / 2) <= CENTER_SNAP_THRESHOLD;
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
    const rightSnap = snapToFarEdge(
        item,
        oldItem,
        { pos: "x", size: "w", limit: gridCols },
        isNearGridCenterY(item, gridRows),
    );
    if (rightSnap) return { ...item, ...rightSnap };

    const bottomSnap = snapToFarEdge(
        item,
        oldItem,
        { pos: "y", size: "h", limit: gridRows },
        isNearGridCenterX(item, gridCols),
    );
    return bottomSnap ? { ...item, ...bottomSnap } : null;
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
    const centeredX = isNearGridCenterX(item, gridCols);
    const centeredY = isNearGridCenterY(item, gridRows);

    return {
        nearTop: item.y <= EDGE_SNAP_THRESHOLD && centeredX,
        nearBottom:
            gridRows - (item.y + item.h) <= EDGE_SNAP_THRESHOLD && centeredX,
        nearLeft: item.x <= EDGE_SNAP_THRESHOLD && centeredY,
        nearRight:
            gridCols - (item.x + item.w) <= EDGE_SNAP_THRESHOLD && centeredY,
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
