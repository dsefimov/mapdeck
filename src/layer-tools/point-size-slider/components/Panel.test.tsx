// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { StoreProvider } from "@core/shell";
import { LocaleStore } from "@core/common/locale/LocaleStore";
import { StateStore } from "@core/lib/state/StateStore";
import {
    LayerTreeNodeTypes,
    type LayerNode,
    type LayerStyle,
} from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import { pointSizeSliderTranslations } from "../locale";
import { POINT_SIZE_SLIDER_ID } from "./Tool";
import { PointSizeSliderComponent } from "./Panel";

afterEach(cleanup);

const NODE_ID = "layer-1";

/** A layer node whose style the test observes being written. */
function layerNode(style: LayerStyle): LayerNode {
    return {
        id: NODE_ID,
        type: LayerTreeNodeTypes.Layer,
        title: "Cloud",
        style,
    } as LayerNode;
}

function renderPanel(style: LayerStyle): ReturnType<typeof vi.fn> {
    const node = layerNode(style);
    const updateLayerStyle = vi.fn();
    const localeStore = new LocaleStore();
    localeStore.registerTranslations(
        POINT_SIZE_SLIDER_ID,
        pointSizeSliderTranslations,
    );

    render(
        <StoreProvider
            store={
                {
                    localeStore,
                    treeStore: { node: () => node, updateLayerStyle },
                    stateStore: new StateStore(),
                } as unknown as StoreRegistry
            }
        >
            <PointSizeSliderComponent nodeId={NODE_ID} />
        </StoreProvider>,
    );
    return updateLayerStyle;
}

describe("PointSizeSlider commit", () => {
    it("writes the style at pointer release, not only after the debounce", () => {
        const updateLayerStyle = renderPanel({
            paint: { "circle-radius": 2 },
        });

        // A drag queues a pending size behind the 150 ms debounce…
        fireEvent.change(screen.getByRole("slider"), {
            target: { value: "1.4" },
        });
        expect(updateLayerStyle).not.toHaveBeenCalled();

        // …and the gesture's end commits now — an unbound callback would
        // lose `this` and never write.
        fireEvent.pointerUp(screen.getByRole("slider"));

        expect(updateLayerStyle).toHaveBeenCalledTimes(1);
        expect(updateLayerStyle).toHaveBeenCalledWith(
            NODE_ID,
            expect.objectContaining({
                paint: expect.objectContaining({ "circle-radius": 1.4 }),
            }),
        );
    });
});
