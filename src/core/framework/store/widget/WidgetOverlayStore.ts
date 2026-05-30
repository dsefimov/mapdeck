import { makeAutoObservable, observable } from "mobx";
import type { LayoutItem } from "react-grid-layout";
import type { RootStore } from "@core/framework/store";
import { logger } from "@core/shared/diagnostics/logger";
import { createDefaultLayout, GRID_CONFIG } from "./WidgetLayoutStore";

export interface OpenWidget {
    id: string;
    layout: LayoutItem;
    isOpen: boolean;
    zIndex: number;
}

export class WidgetOverlayStore {
    private _openWidgets = observable.map<string, OpenWidget>();
    /** Registry for widget-local stores that persist across open/close cycles */
    private _widgetStores = new Map<string, unknown>();

    constructor(readonly rootStore: RootStore) {
        makeAutoObservable(this, { rootStore: false });
    }

    /**
     * Get a persisted widget store by ID, or create one via the factory.
     */
    getWidgetStore<T>(widgetId: string, factory: () => T): T {
        const existing = this._widgetStores.get(widgetId);
        if (existing) {
            return existing as T;
        }
        const newStore = factory();
        this._widgetStores.set(widgetId, newStore);
        return newStore;
    }

    /**
     * Set a widget store explicitly.
     */
    setWidgetStore<T>(widgetId: string, store: T): void {
        this._widgetStores.set(widgetId, store);
    }

    /**
     * Remove a widget store.
     */
    removeWidgetStore(widgetId: string): void {
        this._widgetStores.delete(widgetId);
    }

    /**
     * Opens a widget in the overlay grid.
     * If the widget is already open, brings it to front.
     * For passing typed data to a widget, use its persisted store via getWidgetStore().
     */
    openWidget(widgetId: string): OpenWidget | undefined {
        if (this._openWidgets.has(widgetId)) {
            const existing = this._openWidgets.get(widgetId)!;

            if (existing.isOpen) {
                logger.debug(`Widget "${widgetId}" is already open`);
                this.bringToFront(widgetId);
                return existing;
            }

            existing.isOpen = true;
            this.bringToFront(widgetId);
            return existing;
        }

        const newWidget: OpenWidget = {
            id: widgetId,
            layout: createDefaultLayout(widgetId, this.layoutItems, (id) =>
                this.rootStore.catalogStore.getWidgetById(id),
            ),
            isOpen: true,
            zIndex: this._nextZIndex(),
        };

        this._openWidgets.set(widgetId, newWidget);
        logger.debug(
            `Opened widget "${widgetId}" with layout:`,
            newWidget.layout,
        );

        return newWidget;
    }

    /**
     * Closes a widget (removes from view but keeps in store for state persistence)
     */
    closeWidget(widgetId: string): void {
        const widget = this._openWidgets.get(widgetId);
        if (!widget) {
            logger.warn(`Cannot close widget "${widgetId}" - not found`);
            return;
        }

        widget.isOpen = false;
        logger.debug(`Closed widget "${widgetId}"`);
    }

    /**
     * Updates the layout for a specific widget.
     * The method is an action via makeAutoObservable — no inner runInAction needed.
     */
    updateLayout(widgetId: string, layout: LayoutItem): void {
        const widget = this._openWidgets.get(widgetId);
        if (!widget) {
            logger.warn(
                `Cannot update layout for widget "${widgetId}" - not found`,
            );
            return;
        }
        widget.layout = { ...layout, i: widgetId };
    }

    /**
     * Brings a widget to the front (highest z-index)
     */
    bringToFront(widgetId: string): void {
        const widget = this._openWidgets.get(widgetId);
        if (!widget || !widget.isOpen) {
            logger.warn(
                `Cannot bring to front widget "${widgetId}" - not found or not open`,
            );
            return;
        }

        widget.zIndex = this._nextZIndex();

        logger.debug(
            `Brought widget "${widgetId}" to front with z-index ${widget.zIndex}`,
        );
    }

    /**
     * Get an open widget by ID
     */
    getOpenWidget(widgetId: string): OpenWidget | undefined {
        return this._openWidgets.get(widgetId);
    }

    /** Reassign sequential z-indexes starting from 1 to prevent unbounded growth. */
    private _normalizeZIndexes(): void {
        let i = 1;
        for (const w of this._openWidgets.values()) {
            if (w.isOpen) w.zIndex = i++;
        }
    }

    /** Compute the next z-index: max current + 1, resetting if threshold exceeded. */
    private _nextZIndex(): number {
        const openWidgets = Array.from(this._openWidgets.values()).filter(
            (w) => w.isOpen,
        );
        if (openWidgets.length === 0) return 1;

        const maxZ = Math.max(...openWidgets.map((w) => w.zIndex));

        if (maxZ >= 10_000) {
            this._normalizeZIndexes();
            return openWidgets.length + 1;
        }

        return maxZ + 1;
    }

    /**
     * Sync layout from UI changes (to be called from react-grid-layout onLayoutChange)
     */
    syncLayout(layoutItems: LayoutItem[]): void {
        layoutItems.forEach((item) => {
            const widget = this.getOpenWidget(item.i);
            if (widget) {
                this.updateLayout(item.i, {
                    ...widget.layout,
                    x: item.x,
                    y: item.y,
                    w: item.w,
                    h: item.h,
                });
            }
        });
    }

    // =================== COMPUTED PROPERTIES ===================

    get openWidgets(): OpenWidget[] {
        return Array.from(this._openWidgets.values())
            .filter((widget) => widget.isOpen)
            .sort((a, b) => a.zIndex - b.zIndex);
    }

    get layoutItems(): LayoutItem[] {
        return this.openWidgets.map((widget) => widget.layout);
    }

    get openWidgetIds(): string[] {
        return this.openWidgets.map((widget) => widget.id);
    }

    isWidgetOpen(widgetId: string): boolean {
        const widget = this._openWidgets.get(widgetId);
        return !!widget && widget.isOpen;
    }

    get gridConfig() {
        return GRID_CONFIG;
    }

    dispose(): void {
        this._widgetStores.clear();
        this._openWidgets.clear();
    }
}
