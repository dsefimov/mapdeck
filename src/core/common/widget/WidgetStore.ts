import { makeAutoObservable, observable, runInAction } from "mobx";
import type { LayoutItem } from "react-grid-layout";
import { Registry, type RegisterOptions } from "@core/lib/registry";
import type { CommonRegistry } from "@core/common/common-registry";
import { type StoredWidget, type Widget, LOCALE_KEY_WIDGET_NAME } from "@core/contracts";
import { logger } from "@core/lib/logger";
import { createDefaultLayout, GRID_CONFIG } from "./widgetLayout";
import { clampLayoutItem } from "./layout";

/**
 * Z-index ceiling before the stack is re-normalized from 1: far above any
 * realistic open-widget count, yet bounded so the counter cannot overflow.
 */
const Z_INDEX_RESET_THRESHOLD = 10_000;

/**
 * Observable record of a registered widget: the descriptor, the open flag,
 * the grid layout and the z-order live on the same instance — one registry
 * serves both the sidebar and the grid.
 */
export interface WidgetInstance {
    id: string;
    definition: StoredWidget;
    isOpen: boolean;
    /** Grid layout; computed at first open, then preserved across close/reopen. */
    layout: LayoutItem | null;
    zIndex: number;
}

/**
 * Single widget store: registration (with the unified throw-on-duplicate
 * policy), open/close state, grid layout and z-order. Widget-local state
 * lives in `StateStore` keyed by widget id.
 */
export class WidgetStore {
    private _definitions = new Registry<StoredWidget>();
    private _instances = observable.map<string, WidgetInstance>();

    constructor(readonly rootStore: CommonRegistry) {
        makeAutoObservable<this, "_definitions">(this, {
            rootStore: false,
            _definitions: false,
        });
    }

    /**
     * Registers a widget and creates its instance. Duplicate id throws unless
     * `opts.override`. Translations and settings are
     * auto-registered.
     */
    registerWidget<TProps extends { widgetId: string }>(
        widget: Widget<TProps>,
        opts?: RegisterOptions,
    ): void {
        const definition = widget as StoredWidget;
        this._definitions.register(definition, opts);

        if (definition.localeTranslations) {
            this.rootStore.localeStore.registerTranslations(
                definition.id,
                definition.localeTranslations,
            );
        }

        this._registerWidgetSettings(definition);

        runInAction(() => {
            this._instances.set(definition.id, {
                id: definition.id,
                definition,
                isOpen: false,
                layout: null,
                zIndex: 1,
            });
        });
    }

    getWidgetById(widgetId: string): WidgetInstance | undefined {
        return this._instances.get(widgetId);
    }

    get allWidgets(): WidgetInstance[] {
        return Array.from(this._instances.values());
    }

    /**
     * Opens a widget. The default layout is computed on first open at a free
     * position among the currently open widgets; close preserves the layout.
     * Opening an already-open widget brings it to front.
     */
    openWidget(widgetId: string): WidgetInstance | undefined {
        const instance = this._instances.get(widgetId);
        if (!instance) {
            logger.warn(`Cannot open widget "${widgetId}" - not registered`);
            return undefined;
        }

        if (instance.isOpen) {
            this.bringToFront(widgetId);
            return instance;
        }

        if (!instance.layout) {
            instance.layout = createDefaultLayout(
                widgetId,
                this.layoutItems,
                (id) => this._definitions.get(id),
            );
        }
        instance.isOpen = true;
        instance.zIndex = this._nextZIndex();

        return instance;
    }

    /** Closes a widget (removes from view but keeps layout and local state). */
    closeWidget(widgetId: string): void {
        const instance = this._instances.get(widgetId);
        if (!instance) {
            logger.warn(`Cannot close widget "${widgetId}" - not registered`);
            return;
        }
        instance.isOpen = false;
    }

    /** Updates the layout for a specific widget. */
    updateLayout(widgetId: string, layout: LayoutItem): void {
        const instance = this._instances.get(widgetId);
        if (!instance) {
            logger.warn(`Cannot update layout for widget "${widgetId}"`);
            return;
        }
        instance.layout = clampLayoutItem(
            { ...layout, i: widgetId },
            GRID_CONFIG.cols,
            GRID_CONFIG.rows,
        );
    }

    /** Brings a widget to the front (highest z-index). */
    bringToFront(widgetId: string): void {
        const instance = this._instances.get(widgetId);
        if (!instance || !instance.isOpen) {
            logger.warn(
                `Cannot bring to front widget "${widgetId}" - not open`,
            );
            return;
        }
        instance.zIndex = this._nextZIndex();
    }

    /** Sync layout from UI changes (react-grid-layout onLayoutChange). */
    syncLayout(layoutItems: LayoutItem[]): void {
        for (const item of layoutItems) {
            const instance = this._instances.get(item.i);
            if (instance && instance.layout) {
                instance.layout = clampLayoutItem(
                    {
                        ...instance.layout,
                        x: item.x,
                        y: item.y,
                        w: item.w,
                        h: item.h,
                    },
                    GRID_CONFIG.cols,
                    GRID_CONFIG.rows,
                );
            }
        }
    }

    /** Reassign sequential z-indexes starting from 1 to prevent unbounded growth. */
    private _normalizeZIndexes(): void {
        let i = 1;
        for (const w of this._instances.values()) {
            if (w.isOpen) w.zIndex = i++;
        }
    }

    /** Next z-index: max current + 1, resetting if threshold exceeded. */
    private _nextZIndex(): number {
        const open = this.openWidgets;
        if (open.length === 0) return 1;

        const maxZ = Math.max(...open.map((w) => w.zIndex));
        if (maxZ >= Z_INDEX_RESET_THRESHOLD) {
            this._normalizeZIndexes();
            return open.length + 1;
        }
        return maxZ + 1;
    }

    get openWidgets(): WidgetInstance[] {
        return Array.from(this._instances.values())
            .filter((widget) => widget.isOpen)
            .sort((a, b) => a.zIndex - b.zIndex);
    }

    get layoutItems(): LayoutItem[] {
        return this.openWidgets
            .filter(
                (widget): widget is WidgetInstance & { layout: LayoutItem } =>
                    widget.layout !== null,
            )
            .map((widget) => {
                if (widget.definition.fixed === true) {
                    return {
                        ...widget.layout,
                        isDraggable: false,
                        isResizable: false,
                    };
                }
                return widget.layout;
            });
    }

    get openWidgetIds(): string[] {
        return this.openWidgets.map((widget) => widget.id);
    }

    isWidgetOpen(widgetId: string): boolean {
        return this._instances.get(widgetId)?.isOpen ?? false;
    }

    get gridConfig() {
        return GRID_CONFIG;
    }

    private _registerWidgetSettings(widget: StoredWidget): void {
        if (!widget.settings || widget.settings.length === 0) return;
        this.rootStore.settingsStore.registerSettings(
            widget.id,
            this.rootStore.localeStore.t(widget.id)[LOCALE_KEY_WIDGET_NAME] ??
                widget.id,
            widget.settings,
        );
    }
}
