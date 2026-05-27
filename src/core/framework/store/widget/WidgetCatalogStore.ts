import { makeAutoObservable, runInAction } from "mobx";
import type { Widget, WidgetContext } from "@core/framework/types";
import { logger } from "@core/shared/diagnostics/logger";
import type { RootStore } from "@core/framework/store";

export class WidgetCatalogStore {
    private _widgets = new Map<string, Widget<unknown>>();

    constructor(readonly rootStore: RootStore) {
        makeAutoObservable(this, { rootStore: false });
    }

    private get _widgetContext(): WidgetContext {
        return {
            rootStore: this.rootStore,
        };
    }

    async registerWidget<TProps = Record<string, unknown>>(
        widget: Widget<TProps>,
    ): Promise<void> {
        if (this.hasWidget(widget.id)) {
            logger.warn(
                `Widget with ID "${widget.id}" is already registered. Overwriting.`,
            );
            const existing = this._widgets.get(widget.id)!;
            await this._invokeDestroy(existing);
        }

        // Auto-register translations
        if (widget.localeTranslations) {
            this.rootStore.localeStore.registerTranslations(
                widget.id,
                widget.localeTranslations,
            );
        }

        // Auto-register widget settings before initialization
        this._registerWidgetSettings(widget as Widget<unknown>);

        await this._invokeInitialize(widget as Widget<unknown>);

        runInAction(() => {
            this._widgets.set(widget.id, widget as Widget<unknown>);
        });
    }

    async unregisterWidget(widgetId: string): Promise<boolean> {
        const widget = this._widgets.get(widgetId);
        if (!widget) return false;

        await this._invokeDestroy(widget);

        // Note: Settings are not automatically unregistered when widget is unregistered
        // This is intentional to preserve user settings even if widget is temporarily unavailable
        // Settings should be cleaned up separately if needed

        return runInAction(() => this._widgets.delete(widgetId));
    }

    private async _invokeInitialize(widget: Widget<unknown>): Promise<void> {
        if (!widget.initialize) return;

        try {
            const result = widget.initialize(this._widgetContext);
            if (result instanceof Promise) {
                await result;
            }
        } catch (error) {
            logger.error(`Failed to initialize widget "${widget.id}":`, error);
            throw error;
        }
    }

    private async _invokeDestroy(widget: Widget<unknown>): Promise<void> {
        if (!widget.destroy) return;

        try {
            const result = widget.destroy();
            if (result instanceof Promise) {
                await result;
            }
        } catch (error) {
            logger.error(`Failed to destroy widget "${widget.id}":`, error);
        }
    }

    /**
     * Auto-register widget settings from widget.settings array
     */
    private _registerWidgetSettings(widget: Widget<unknown>): void {
        if (!widget.settings || widget.settings.length === 0) {
            return;
        }

        for (const setting of widget.settings) {
            this.rootStore.settingsStore.registerSetting(
                widget.id,
                this.rootStore.localeStore.t(widget.id)["widget.name"]!,
                setting,
            );
        }
    }

    getWidgetById<TProps = Record<string, unknown>>(
        widgetId: string,
    ): Widget<TProps> | undefined {
        return this._widgets.get(widgetId) as Widget<TProps> | undefined;
    }

    get allWidgets(): Widget<unknown>[] {
        return Array.from(this._widgets.values());
    }

    hasWidget(widgetId: string): boolean {
        return this._widgets.has(widgetId);
    }

    async dispose(): Promise<void> {
        for (const widget of this._widgets.values()) {
            await this._invokeDestroy(widget);
        }
        this._widgets.clear();
    }
}
