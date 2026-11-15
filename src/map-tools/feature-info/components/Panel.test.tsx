// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoreProvider } from "@core/shell";
import { AttributeValueStore } from "@core/common/attribute-value";
import type { CommonRegistry } from "@core/common/common-registry";
import type { StoreRegistry } from "@core/store-registry";
import { FeatureInfoComponent } from "./Panel";
import { FeatureInfoStore } from "../utils/FeatureInfoStore";
import type { FeatureGroup, MapToolComponentProps } from "@core/contracts";

vi.mock("../utils/FeatureInfoController", () => ({
    FeatureInfoController: class {
        attach = vi.fn();
        detach = vi.fn();
    },
}));

const DICT = {
    eyebrow: "Feature info",
    instructions: "Click a feature",
    "noClickYet": "No click yet",
    "noFeatures": "No features",
    "layer.label": "Layer",
    "select.placeholder": "Select…",
} as Record<string, string>;

const group = (layerName: string): FeatureGroup => ({
    layerId: layerName,
    layerName,
    features: [
        {
            id: `${layerName}-1`,
            layerId: layerName,
            layerName,
            attributes: { name: layerName },
        },
    ],
});

function renderPanel(store: FeatureInfoStore): void {
    const props = {
        context: {
            stateStore: {
                get: (_id: string, factory: () => unknown) => factory(),
            },
            locale: {
                t: (namespace: string) =>
                    namespace === "feature-info" ? DICT : {},
            },
        },
        map: {
            getCanvas: () => null,
            on: () => undefined,
            off: () => undefined,
        },
        overlayManager: {},
        deactivate: vi.fn(),
        store,
    } as unknown as MapToolComponentProps & { store: FeatureInfoStore };
    // SelectedContent reads the attribute value renderer store through the
    // registry context — the slice it needs is all this fixture provides.
    const registry = {
        attributeValueStore: new AttributeValueStore({
            widgetStore: {
                openWidget: vi.fn(),
                isWidgetOpen: () => false,
            },
        } as unknown as CommonRegistry),
    } as unknown as StoreRegistry;
    render(
        <StoreProvider store={registry}>
            <FeatureInfoComponent {...props} />
        </StoreProvider>,
    );
}

afterEach(cleanup);

describe("FeatureInfoComponent layer dropdown", () => {
    it("switches the selected group through the store", async () => {
        const store = new FeatureInfoStore();
        store.markClicked({ lng: 30, lat: 50 });
        store.setGroups([group("towers"), group("wires")]);
        renderPanel(store);

        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Layer" }));

        const second = await screen.findByRole("option", {
            name: /wires/,
        });
        await user.click(second);

        expect(store.selectedIndex).toBe(1);
    });
});
