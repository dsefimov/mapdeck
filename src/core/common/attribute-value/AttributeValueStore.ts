import { makeAutoObservable, observable, reaction } from "mobx";
import { Registry, type RegisterOptions } from "@core/lib/registry";
import type { AttributeValueRenderer } from "@core/contracts";
import type { CommonRegistry } from "../common-registry";

/**
 * The media viewer widget that `openView` brings up. The id lives here —
 * the widget module imports it; the store cannot import an extension.
 */
export const ATTRIBUTE_VALUE_VIEWER_WIDGET_ID = "media-viewer-widget";

/** The fullscreen view currently open: which renderer shows which value. */
export interface AttributeValueView {
    rendererId: string;
    value: unknown;
}

/**
 * Attribute value renderer registry plus the one open viewer view. The
 * data table renders cells through the renderer list; `openView` records
 * the click's target and opens the viewer widget that renders it through
 * the renderer's `renderViewer`.
 */
export class AttributeValueStore {
    private _renderers = new Registry<AttributeValueRenderer>(
        "Attribute value renderer",
    );

    private _view: AttributeValueView | null = null;

    private readonly _renderersList = observable.array<AttributeValueRenderer>([], {
        deep: false,
    });

    private readonly _disposeViewerSync: () => void;

    constructor(private readonly rootStore: CommonRegistry) {
        // The view lives exactly as long as the viewer window. Tying it to
        // window state (not a component cleanup) keeps it through React
        // StrictMode's dev double-mount.
        this._disposeViewerSync = reaction(
            () =>
                this.rootStore.widgetStore.isWidgetOpen(
                    ATTRIBUTE_VALUE_VIEWER_WIDGET_ID,
                ),
            (open) => {
                if (!open) this.closeView();
            },
        );
        // Wiring, not state: the disposer stays outside observability
        // (assigned before observability, as RootStore wires its views).
        makeAutoObservable<this, "_renderers" | "_disposeViewerSync">(this, {
            _renderers: false,
            _disposeViewerSync: false,
        });
    }

    dispose(): void {
        this._disposeViewerSync();
    }

    /** Registers a renderer. Duplicate id throws unless `opts.override`. */
    register = (renderer: AttributeValueRenderer, opts?: RegisterOptions): void => {
        this._renderers.register(renderer, opts);
        this._renderersList.replace(this._renderers.getAll());
    };

    /** Registered renderers in registration order — cell matching order. */
    get renderersList(): readonly AttributeValueRenderer[] {
        return this._renderersList;
    }

    getRenderer(id: string): AttributeValueRenderer | undefined {
        return this._renderers.get(id);
    }

    get view(): AttributeValueView | null {
        return this._view;
    }

    openView = (rendererId: string, value: unknown): void => {
        this._view = { rendererId, value };
        // The click that opens the viewer also raises the source window
        // (grid focus) after this handler runs — open past that bump, or
        // the viewer lands underneath the window it was opened from.
        void Promise.resolve().then(() => {
            this.rootStore.widgetStore.openWidget(
                ATTRIBUTE_VALUE_VIEWER_WIDGET_ID,
            );
        });
    };

    closeView = (): void => {
        this._view = null;
    };
}
