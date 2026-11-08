import React, { useRef, type ComponentProps } from "react";
import type { LayoutItem } from "react-grid-layout/legacy";
import { interpolate } from "@core/lib/text";
import { cn } from "../../utils/cn";
import { IconButton } from "../../components/primitives/icon-button/IconButton";
import { Text } from "../../components/primitives/text/Text";
import { ErrorBoundary } from "../../components/feedback/error-boundary/ErrorBoundary";
import type { GridConfig } from "./snapGeometry";
import { useAutoSize } from "./useAutoSize";
import styles from "./WidgetGrid.module.css";

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

/** Chrome strings of one window: the header tooltip and the close button. */
export type GridWindowDict = Record<
    "widgetGrid.dragToMove" | "widgetGrid.closeLabel",
    string
>;

interface GridWindowOwnProps {
    widget: WidgetGridInstance;
    dict: GridWindowDict;
    /** Localized display name of a widget by its id. */
    getWidgetName: (widgetId: string) => string;
    rowHeight: number;
    gridConfig: GridConfig;
    /** Measuring container for auto-size column width. */
    containerRef: React.RefObject<HTMLDivElement | null>;
    onUpdateLayout(widgetId: string, item: LayoutItem): void;
    onCloseWidget(widgetId: string): void;
    onFocusWidget(widgetId: string): void;
}

/**
 * The window root is a plain `div` pass-through: react-grid-layout clones it
 * with the item classes and geometry, react-draggable with the mouse/touch
 * drag handlers, and react-resizable appends its handle as children.
 * Dropping any of them detaches the window from the grid.
 */
export type GridWindowProps = GridWindowOwnProps &
    Omit<ComponentProps<"div">, keyof GridWindowOwnProps>;

/**
 * One grid window: header, close control, and the widget component. A `fixed`
 * widget is not draggable/resizable and has no close control; `size: "auto"`
 * sizes the window to its content.
 */
export const GridWindow: (props: GridWindowProps) => React.ReactNode = ({
    widget,
    dict,
    getWidgetName,
    rowHeight,
    gridConfig,
    containerRef,
    onUpdateLayout,
    onCloseWidget,
    onFocusWidget,
    ...injected
}) => {
    const definition = widget.definition;
    const isFixed = definition.fixed === true;
    const isAutoSize = definition.size === "auto";
    const WidgetComponent = definition.component;
    const widgetName = getWidgetName(definition.id);

    const headerRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    useAutoSize({
        enabled: isAutoSize,
        widgetId: widget.id,
        layout: widget.layout,
        rowHeight,
        gridConfig,
        containerRef,
        headerRef,
        contentRef,
        onMeasure: onUpdateLayout,
    });

    return (
        <div
            {...injected}
            className={cn(styles.window, injected.className)}
            style={{ ...injected.style, zIndex: widget.zIndex }}
            onClick={() => onFocusWidget(widget.id)}
        >
            <div
                ref={headerRef}
                className={styles.windowHeader}
                title={
                    isFixed
                        ? widgetName
                        : interpolate(dict["widgetGrid.dragToMove"], {
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
                            label={interpolate(
                                dict["widgetGrid.closeLabel"],
                                { name: widgetName },
                            )}
                            onClick={() => onCloseWidget(widget.id)}
                        />
                    </span>
                )}
            </div>
            <div
                ref={contentRef}
                className={styles.windowContent}
                style={
                    isAutoSize
                        ? {
                              flex: "none",
                              overflow: "visible",
                              width: "max-content",
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
            </div>
            {injected.children}
        </div>
    );
};
