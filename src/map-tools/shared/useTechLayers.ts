import { useMemo } from "react";
import type { Layer } from "@deck.gl/core";
import { renderTechLayers, type TechLayerStore } from "@core/domain/map";
import { useMeasureColors } from "@core/ui/theme";

/**
 * The measure tools' tech layers as `[id, layer]` pairs: reads the store's
 * observable state, injects the current theme colors, and memoizes until
 * either changes. Compose the result with tool-specific layers and hand it
 * to `useOverlayLayers`.
 */
export function useTechLayers(
    store: TechLayerStore,
    layerPrefix: string,
): ReadonlyArray<readonly [string, Layer | null]> {
    const colors = useMeasureColors();
    const { geometries, drawing, previewPoint } = store;

    return useMemo(
        () =>
            renderTechLayers(layerPrefix, { geometries, drawing, previewPoint }, colors),
        [geometries, drawing, previewPoint, colors, layerPrefix],
    );
}
