import { makeAutoObservable, observable } from "mobx";
import { Registry, type RegisterOptions } from "@core/lib/registry";
import type { AttributeValueRenderer } from "@core/contracts";

/** The fullscreen view currently open: which renderer shows which value. */
export interface AttributeValueView {
    rendererId: string;
    value: unknown;
}

/**
 * Attribute value renderer registry plus the one open fullscreen view.
 * The data table renders cells through the renderer list; `openView` is
 * the click target behind a renderer's `api.open`, and the workspace-level
 * viewer layer renders `view` through the renderer's `renderViewer`.
 */
export class AttributeValueStore {
    private _renderers = new Registry<AttributeValueRenderer>(
        "Attribute value renderer",
    );

    private _view: AttributeValueView | null = null;

    private readonly _renderersList = observable.array<AttributeValueRenderer>([], {
        deep: false,
    });

    constructor() {
        makeAutoObservable<this, "_renderers">(this, {
            _renderers: false,
        });
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
    };

    closeView = (): void => {
        this._view = null;
    };
}
