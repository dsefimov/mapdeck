import { makeAutoObservable, observable, reaction } from "mobx";
import { Registry, type RegisterOptions } from "@core/lib/registry";
import { logger } from "@core/lib/logger";
import type { AttributeValueRenderer } from "@core/contracts";
import type { CommonRegistry } from "../common-registry";

/**
 * The id lives here — the widget module imports it; a common store cannot
 * import an extension.
 */
export const ATTRIBUTE_VALUE_VIEWER_WIDGET_ID = "media-viewer-widget";

let nextViewSeq = 0;

/** The viewer keys its content by `seq`: every open is a fresh state. */
export interface AttributeValueView {
    readonly seq: number;
    readonly rendererId: string;
    readonly value: unknown;
}

/** Attribute value renderer registry plus the one open viewer view. */
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
            { name: "attribute-value-viewer-window-sync" },
        );
        // Wiring, not state: the disposer stays outside observability
        // (assigned before observability, as RootStore wires its views).
        makeAutoObservable<
            this,
            "_renderers" | "_disposeViewerSync" | "_view"
        >(this, {
            _renderers: false,
            _disposeViewerSync: false,
            // Values are open data carried for renderers, not state to
            // observe: keep the reference as opened, no deep clone.
            _view: observable.ref,
        });
    }

    dispose(): void {
        this._disposeViewerSync();
    }

    register = (renderer: AttributeValueRenderer, opts?: RegisterOptions): void => {
        this._renderers.register(renderer, opts);
        this._renderersList.replace(this._renderers.getAll());
    };

    /** Registration order is the cell-matching precedence order. */
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
        const renderer = this._renderers.get(rendererId);
        if (!renderer?.renderViewer) {
            logger.warn(
                `Attribute value renderer "${rendererId}" has no renderViewer — nothing to open`,
            );
            return;
        }
        this._view = { seq: ++nextViewSeq, rendererId, value };
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
