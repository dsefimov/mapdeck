// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { Layer } from "@deck.gl/core";
import type { OverlayManager } from "@core/contracts/domain/map-context";
import { useOverlayLayers } from "./useOverlayLayers";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function managerStub(): OverlayManager<Layer> & {
    addLayer: ReturnType<typeof vi.fn>;
    removeLayer: ReturnType<typeof vi.fn>;
} {
    return {
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
    } as unknown as ReturnType<typeof managerStub>;
}

function Harness({
    overlayManager,
    layers,
}: {
    overlayManager: OverlayManager<Layer>;
    layers: ReadonlyArray<readonly [string, Layer | null]>;
}) {
    useOverlayLayers(overlayManager, layers);
    return null;
}

function layer(id: string): Layer {
    return { id } as unknown as Layer;
}

describe("useOverlayLayers", () => {
    it("adds present layers and removes null slots", () => {
        const overlayManager = managerStub();

        render(
            <Harness
                overlayManager={overlayManager}
                layers={[
                    ["a", layer("a")],
                    ["b", null],
                ]}
            />,
        );

        expect(overlayManager.addLayer).toHaveBeenCalledWith("a", expect.anything());
        expect(overlayManager.removeLayer).toHaveBeenCalledWith("b");
    });

    it("re-syncs when the layer array reference changes", () => {
        const overlayManager = managerStub();
        const first = render(
            <Harness overlayManager={overlayManager} layers={[["a", layer("a")]]} />,
        );

        first.rerender(
            <Harness overlayManager={overlayManager} layers={[["b", layer("b")]]} />,
        );

        // The old tuple unwired, the new one added.
        expect(overlayManager.removeLayer).toHaveBeenCalledWith("a");
        expect(overlayManager.addLayer).toHaveBeenCalledWith("b", expect.anything());
    });

    it("removes everything on unmount", () => {
        const overlayManager = managerStub();
        const view = render(
            <Harness
                overlayManager={overlayManager}
                layers={[
                    ["a", layer("a")],
                    ["b", layer("b")],
                ]}
            />,
        );

        view.unmount();

        expect(overlayManager.removeLayer).toHaveBeenCalledWith("a");
        expect(overlayManager.removeLayer).toHaveBeenCalledWith("b");
    });
});
