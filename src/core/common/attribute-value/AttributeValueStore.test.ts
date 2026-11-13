import { configure } from "mobx";
import { describe, expect, it } from "vitest";
import type { AttributeValueRenderer } from "@core/contracts";
import { AttributeValueStore } from "./AttributeValueStore";

// Reproduce production MobX strictness (src/app/mobxConfig.ts).
configure({ enforceActions: "always" });

const renderer = (id: string): AttributeValueRenderer => ({
    id,
    matches: (value) => value === id,
    renderCell: () => null,
});

describe("AttributeValueStore", () => {
    it("lists renderers in registration order", () => {
        const store = new AttributeValueStore();
        store.register(renderer("photo"));
        store.register(renderer("album"));

        expect(store.renderersList.map((r) => r.id)).toEqual([
            "photo",
            "album",
        ]);
    });

    it("throws on a duplicate id and replaces with override", () => {
        const store = new AttributeValueStore();
        store.register(renderer("photo"));

        expect(() => store.register(renderer("photo"))).toThrow(
            /already registered/,
        );

        store.register(renderer("photo"), { override: true });
        expect(store.renderersList).toHaveLength(1);
    });

    it("opens and closes the single view", () => {
        const store = new AttributeValueStore();
        store.register(renderer("photo"));

        store.openView("photo", { kind: "photo", url: "x.png" });
        expect(store.view).toEqual({
            rendererId: "photo",
            value: { kind: "photo", url: "x.png" },
        });

        store.closeView();
        expect(store.view).toBeNull();
    });

    it("looks a renderer up by id", () => {
        const store = new AttributeValueStore();
        const photo = renderer("photo");
        store.register(photo);

        expect(store.getRenderer("photo")).toBe(photo);
        expect(store.getRenderer("missing")).toBeUndefined();
    });
});
