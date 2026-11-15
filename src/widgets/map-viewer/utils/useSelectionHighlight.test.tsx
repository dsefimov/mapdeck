// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Layer } from "@deck.gl/core";
import { configure } from "mobx";
import { Bbox } from "@core/lib/geo";
import { StateStore } from "@core/lib/state";
import { SELECTION_HIGHLIGHT_LAYER_ID } from "@core/domain/map";
import {
    SelectionStore,
    SELECTION_STATE_KEY,
    SELECTION_COLOR_SETTING_ID,
    type SelectionRecord,
} from "@core/common/selection";
import type { StoreRegistry } from "@core/store-registry";
import { useSelectionHighlight } from "./useSelectionHighlight";

configure({ enforceActions: "always" });

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

const record = (key: string, west = 0): SelectionRecord => ({
    key,
    footprint: { kind: "bbox", bbox: new Bbox([west, 0, west + 1, 1]) },
});

function makeRoot(nodes: Record<string, { isVisible: boolean }>) {
    const stateStore = new StateStore();
    const overlayManager = {
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
    };
    const root = {
        stateStore,
        settingsStore: {
            getStringSetting: (id: string) =>
                id === SELECTION_COLOR_SETTING_ID ? "#ffd400" : undefined,
        },
        treeStore: {
            node: (id: string) => nodes[id],
        },
        mapStore: { context: { overlayManager } },
    } as unknown as StoreRegistry;
    return { root, overlayManager, stateStore };
}

function selectionOf(root: StoreRegistry): SelectionStore {
    return root.stateStore.get(
        SELECTION_STATE_KEY,
        () => new SelectionStore(),
    );
}

describe("useSelectionHighlight", () => {
    it("renders visible layers' records and skips hidden ones", () => {
        const { root, overlayManager } = makeRoot({
            a: { isVisible: true },
            hidden: { isVisible: false },
        });
        const selection = selectionOf(root);
        act(() => {
            selection.applySelection(
                "a",
                [record("feature-a1")],
                "new",
            );
            selection.applySelection(
                "hidden",
                [record("feature-h1")],
                "new",
            );
        });

        renderHook(() => useSelectionHighlight(root));

        expect(overlayManager.addLayer).toHaveBeenCalledTimes(1);
        const [id, layer] = overlayManager.addLayer.mock.calls[0] as [
            string,
            Layer,
        ];
        expect(id).toBe(SELECTION_HIGHLIGHT_LAYER_ID);
        expect((layer.props as { data: unknown[] }).data).toHaveLength(1);
    });

    it("a visibility flip re-renders without any selection change", () => {
        const nodes: Record<string, { isVisible: boolean }> = {
            a: { isVisible: true },
        };
        const { root, overlayManager } = makeRoot(nodes);
        const selection = selectionOf(root);
        act(() => {
            selection.applySelection("a", [record("feature-a1")], "new");
        });

        const { rerender } = renderHook(() => useSelectionHighlight(root));
        expect(overlayManager.addLayer).toHaveBeenCalledTimes(1);

        act(() => {
            nodes.a!.isVisible = false;
        });
        rerender();

        expect(overlayManager.removeLayer).toHaveBeenCalledWith(
            SELECTION_HIGHLIGHT_LAYER_ID,
        );
    });

    it("an empty selection removes the layer", () => {
        const { root, overlayManager } = makeRoot({});
        renderHook(() => useSelectionHighlight(root));

        expect(overlayManager.addLayer).not.toHaveBeenCalled();
        expect(overlayManager.removeLayer).toHaveBeenCalledWith(
            SELECTION_HIGHLIGHT_LAYER_ID,
        );
    });
});
