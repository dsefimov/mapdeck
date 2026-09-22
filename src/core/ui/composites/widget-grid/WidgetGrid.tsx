import { observer } from "mobx-react-lite";
import React, {
    useState,
    useMemo,
    useRef,
    useCallback,
    useEffect,
    useLayoutEffect,
    type RefObject,
} from "react";
import {
    Responsive,
    WidthProvider,
    type Layout,
    type ResponsiveLayouts,
    type LayoutItem,
} from "react-grid-layout/legacy";
import { formatDict, typedDict } from "@core/lib/text";
import { IconButton } from "@core/ui/components/primitives/icon-button/IconButton";
import { Text } from "@core/ui/components/primitives/text/Text";
import {
    applyDragSnap,
    calculateEdgeSnap,
    calculateRowHeight,
    computeActiveEdgeZones,
} from "./snapGeometry";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import styles from "./WidgetGrid.module.css";
import { ErrorBoundary } from "@core/ui/components";

const ResponsiveGridLayout = WidthProvider(Responsive);

/** What a grid window renders — the widget component contract of the kit. */
type GridWidgetComponent = (props: {
    widgetId: string;
    className?: string;
}) => React.ReactNode | Promise<React.ReactNode>;

/**
 * Structural slice of a widget instance as the grid sees it. The kit knows no
 * stores (AGENTS layer rules) — the composition root passes the widget
 * subsystem's instances, which satisfy this shape structurally.
 */
export interface WidgetGridInstance {
    readonly id: string;
    readonly zIndex: number;
    readonly layout: LayoutItem | null;
    readonly definition: {
        readonly id: string;
        readonly placement?: string;
        readonly fixed?: boolean;
        /** `"auto"` sizes the window to its content; any other shape is ignored. */
        readonly size?: unknown;
        readonly component: GridWidgetComponent;
    };
}

/** Grid geometry slice the snap math and layout rendering need. */
export interface WidgetGridConfig {
    readonly cols: number;
    readonly rows: number;
    readonly margin: readonly [number, number];
    readonly containerPadding: readonly [number, number];
    readonly defaultWidth: number;
    readonly defaultHeight: number;
}

/**
 * Structural slice of the widget subsystem the grid consumes — layout state
 * plus the mutation entry points. `WidgetStore` satisfies it structurally;
 * the kit itself stays store-agnostic.
 */
export interface WidgetGridStore {
    readonly openWidgets: readonly WidgetGridInstance[];
    readonly layoutItems: LayoutItem[];
    readonly gridConfig: WidgetGridConfig;
    updateLayout(widgetId: string, layout: LayoutItem): void;
    syncLayout(layoutItems: LayoutItem[]): void;
    closeWidget(widgetId: string): void;
    bringToFront(widgetId: string): void;
}

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

/** Typed view over the core dictionary the grid chrome consumes. */
type WidgetGridDict = Record<WidgetGridKey, string>;

export interface WidgetGridProps {
    /** The widget subsystem slice (e.g. the app's widget store). */
    store: WidgetGridStore;
    /** Core dictionary for the grid's own chrome strings. */
    dict: Record<string, string>;
    /** Localized display name of a widget by its id. */
    getWidgetName: (widgetId: string) => string;
}

const WidgetGrid: (props: WidgetGridProps) => React.ReactNode = observer(
    ({ store, dict, getWidgetName }) => {
        const { openWidgets, gridConfig } = store;
        const gridDict = typedDict<WidgetGridKey>(dict);

        const gridWidgets = openWidgets.filter(
            (widget) => (widget.definition.placement ?? "grid") === "grid",
        );

        const containerRef = useRef<HTMLDivElement>(null);
        const windowParts = useRef(new Map<string, WindowPartRefs>());
        const [rowHeight, setRowHeight] = useState(40);
        const [activeEdgeZones, setActiveEdgeZones] = useState<Set<string>>(
            new Set(),
        );

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
                    store.updateLayout(item.i, item);
                }, 0);
                pendingLayoutTimers.current.add(timer);
            },
            [store],
        );

        useLayoutEffect(() => {
            if (gridWidgets.length === 0) return;
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
                        calculateRowHeight(
                            entry.contentRect.height,
                            layoutConfig,
                        ),
                    );
                }
            });

            resizeObserver.observe(container);
            setRowHeight(
                calculateRowHeight(container.clientHeight, layoutConfig),
            );

            return () => resizeObserver.disconnect();
        }, [gridConfig, gridWidgets.length]);

        // Closed windows leave their ref entries behind — drop them.
        useEffect(() => {
            const open = new Set(gridWidgets.map((w) => w.id));
            for (const id of windowParts.current.keys()) {
                if (!open.has(id)) windowParts.current.delete(id);
            }
        }, [gridWidgets]);

        const edgeZones = useMemo(() => {
            if (activeEdgeZones.size === 0) return null;

            return (
                <div className={styles.edgeZones}>
                    {activeEdgeZones.has("top") && (
                        <div
                            className={`${styles.edgeZone} ${styles.edgeZoneTop} ${styles.edgeZoneActive}`}
                            title={gridDict["widgetGrid.dragToTop"]}
                        />
                    )}
                    {activeEdgeZones.has("bottom") && (
                        <div
                            className={`${styles.edgeZone} ${styles.edgeZoneBottom} ${styles.edgeZoneActive}`}
                            title={gridDict["widgetGrid.dragToBottom"]}
                        />
                    )}
                    {activeEdgeZones.has("left") && (
                        <div
                            className={`${styles.edgeZone} ${styles.edgeZoneLeft} ${styles.edgeZoneActive}`}
                            title={gridDict["widgetGrid.dragToLeft"]}
                        />
                    )}
                    {activeEdgeZones.has("right") && (
                        <div
                            className={`${styles.edgeZone} ${styles.edgeZoneRight} ${styles.edgeZoneActive}`}
                            title={gridDict["widgetGrid.dragToRight"]}
                        />
                    )}
                </div>
            );
        }, [activeEdgeZones, gridDict]);

        if (gridWidgets.length === 0) {
            return null;
        }

        const handleLayoutChange = (
            layout: Layout,
            _layouts: ResponsiveLayouts<string>,
        ) => {
            store.syncLayout(
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
            setActiveEdgeZones(new Set());
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
            setActiveEdgeZones(new Set());
        };

        const handleDrag = (
            _layout: Layout,
            _oldItem: LayoutItem | null,
            newItem: LayoutItem | null,
        ) => {
            if (!newItem) return;
            setActiveEdgeZones(computeActiveEdgeZones(newItem, gridConfig));
        };

        return (
            <div className={styles.grid}>
                {edgeZones}
                <div ref={containerRef} className={styles.inner}>
                    <ResponsiveGridLayout
                        className={styles.container ?? ""}
                        layouts={{
                            lg: store.layoutItems as Layout,
                        }}
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
                        {gridWidgets.map((widget) =>
                            renderGridWindow({
                                widget,
                                rowHeight,
                                containerRef,
                                windowParts,
                                dict: gridDict,
                                getWidgetName,
                                store,
                            }),
                        )}
                    </ResponsiveGridLayout>
                </div>
            </div>
        );
    },
);

const MIN_AUTO_SIZE_UNITS = 2;
const MAX_CONTENT = "max-content";

/** Header/content element refs of one grid window, for auto-size measurement. */
interface WindowPartRefs {
    header: RefObject<HTMLDivElement | null>;
    content: RefObject<HTMLDivElement | null>;
}

/**
 * Stable per-widget element refs for auto-size measurement. Plain
 * `{ current }` objects keyed by widget id: React-managed refs cannot be
 * created inside `renderGridWindow` (a plain function, not a component),
 * and the objects must keep identity across re-renders so measurement
 * effects don't re-run. Entries are pruned when the widget closes.
 */
function windowPartRefs(
    registry: RefObject<Map<string, WindowPartRefs>>,
    id: string,
): WindowPartRefs {
    let parts = registry.current.get(id);
    if (!parts) {
        parts = { header: { current: null }, content: { current: null } };
        registry.current.set(id, parts);
    }
    return parts;
}

/**
 * The only responsive breakpoint: layouts and cols exist for "lg" alone, so
 * this number is the always-lg sentinel react-grid-layout needs to switch
 * from the default "md" bucket.
 */
const GRID_BREAKPOINT_LG = 1200;

interface GridWindowParams {
    widget: WidgetGridInstance;
    rowHeight: number;
    containerRef: RefObject<HTMLDivElement | null>;
    windowParts: RefObject<Map<string, WindowPartRefs>>;
    dict: WidgetGridDict;
    getWidgetName: (widgetId: string) => string;
    store: WidgetGridStore;
}

/**
 * Renders a single grid window. A `fixed` widget is not draggable/resizable
 * and has no close control; `size: "auto"` sizes the window to its content.
 */
const renderGridWindow = (params: GridWindowParams): React.ReactNode => {
    const { widget } = params;
    const isFixed = widget.definition.fixed === true;

    const { rowHeight, containerRef, windowParts, dict, getWidgetName, store } =
        params;
    const definition = widget.definition;
    const WidgetComponent = definition.component;
    const widgetName = getWidgetName(definition.id);
    const isAutoSize = definition.size === "auto";
    const parts = windowPartRefs(windowParts, widget.id);

    return (
        <div
            key={widget.id}
            className={styles.window}
            style={{ zIndex: widget.zIndex }}
            onClick={() => store.bringToFront(widget.id)}
        >
            <div
                ref={parts.header}
                className={styles.windowHeader}
                title={
                    isFixed
                        ? widgetName
                        : formatDict(dict["widgetGrid.dragToMove"], {
                              name: widgetName,
                          })
                }
            >
                <Text variant="title" truncate>
                    {widgetName}
                </Text>
                {!isFixed && (
                    <span
                        className={styles.closeWrap}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <IconButton
                            icon="close"
                            label={formatDict(
                                dict["widgetGrid.closeLabel"],
                                { name: widgetName },
                            )}
                            onClick={() => store.closeWidget(widget.id)}
                        />
                    </span>
                )}
            </div>
            <div
                ref={parts.content}
                className={styles.windowContent}
                style={
                    isAutoSize
                        ? {
                              flex: "none",
                              overflow: "visible",
                              width: MAX_CONTENT,
                          }
                        : undefined
                }
            >
                <ErrorBoundary dict={dict}>
                    <WidgetComponent
                        widgetId={widget.id}
                        className={styles.windowComponent ?? ""}
                    />
                </ErrorBoundary>
                {isAutoSize && (
                    <AutoSizeMeasure
                        widget={widget}
                        rowHeight={rowHeight}
                        containerRef={containerRef}
                        headerRef={parts.header}
                        contentRef={parts.content}
                        store={store}
                    />
                )}
            </div>
        </div>
    );
};

/**
 * Auto-size measurer of a widget window: measures the content's natural
 * size and resizes the widget's grid layout to fit. Renders nothing — the
 * header/content elements arrive as per-widget refs from the grid, so the
 * measurement never walks the DOM by structure or class name.
 */
const AutoSizeMeasure: (props: {
    widget: WidgetGridInstance;
    rowHeight: number;
    containerRef: RefObject<HTMLDivElement | null>;
    headerRef: RefObject<HTMLDivElement | null>;
    contentRef: RefObject<HTMLDivElement | null>;
    store: WidgetGridStore;
}) => React.ReactNode = observer(
    ({ widget, rowHeight, containerRef, headerRef, contentRef, store }) => {
        useLayoutEffect(() => {
            const headerEl = headerRef.current;
            const contentEl = contentRef.current;
            const container = containerRef.current;
            if (!headerEl || !contentEl || !container) return;

            const measure = () => {
                const gridConfig = store.gridConfig;
                const colWidth =
                    (container.clientWidth -
                        gridConfig.containerPadding[0] * 2) /
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

                const current = widget.layout;
                if (!current) return;
                if (
                    Math.abs(current.w - newW) < 0.5 &&
                    Math.abs(current.h - newH) < 0.5
                ) {
                    return;
                }
                store.updateLayout(widget.id, {
                    ...current,
                    w: newW,
                    h: newH,
                });
            };

            measure();
            const observer = new ResizeObserver(measure);
            observer.observe(contentEl);
            return () => observer.disconnect();
        }, [
            widget.id,
            widget.layout,
            rowHeight,
            store,
            containerRef,
            headerRef,
            contentRef,
        ]);

        return null;
    },
);

export default WidgetGrid;
