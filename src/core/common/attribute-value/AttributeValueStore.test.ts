import { configure } from "mobx";
import { describe, expect, it, vi } from "vitest";
import type { AttributeValueRenderer } from "@core/contracts";
import type { CommonRegistry } from "../common-registry";
import {
    ATTRIBUTE_VALUE_VIEWER_WIDGET_ID,
    AttributeValueStore,
} from "./AttributeValueStore";

// Reproduce production MobX strictness (src/app/mobxConfig.ts).
configure({ enforceActions: "always" });

const renderer = (id: string): AttributeValueRenderer => ({
    id,
    matches: (value) => value === id,
    renderCell: () => null,
});

function makeStore() {
    const openWidget = vi.fn();
    const rootStore = {
        widgetStore: { openWidget, isWidgetOpen: () => false },
    } as unknown as CommonRegistry;
    const store = new AttributeValueStore(rootStore);
    return { store, openWidget };
}

describe("AttributeValueStore", () => {
    it("lists renderers in registration order", () => {
        const { store } = makeStore();
        store.register(renderer("photo"));
        store.register(renderer("album"));

        expect(store.renderersList.map((r) => r.id)).toEqual([
            "photo",
            "album",
        ]);
    });

    it("throws on a duplicate id and replaces with override", () => {
        const { store } = makeStore();
        store.register(renderer("photo"));

        expect(() => store.register(renderer("photo"))).toThrow(
            /already registered/,
        );

        store.register(renderer("photo"), { override: true });
        expect(store.renderersList).toHaveLength(1);
    });

    it("openView records the view and opens the viewer widget", async () => {
        const { store, openWidget } = makeStore();
        store.register(renderer("photo"));
        const value = { kind: "photo", url: "x.png" };

        store.openView("photo", value);
        expect(store.view).toEqual({ rendererId: "photo", value });
        // The open is deferred past the initiating click (see openView).
        await vi.waitFor(() =>
            expect(openWidget).toHaveBeenCalledWith(
                ATTRIBUTE_VALUE_VIEWER_WIDGET_ID,
            ),
        );

        store.closeView();
        expect(store.view).toBeNull();
    });

    it("looks a renderer up by id", () => {
        const { store } = makeStore();
        const photo = renderer("photo");
        store.register(photo);

        expect(store.getRenderer("photo")).toBe(photo);
        expect(store.getRenderer("missing")).toBeUndefined();
    });
});
