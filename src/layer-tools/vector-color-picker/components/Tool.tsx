import type React from "react";
import type { LayerTool } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import { VectorColorPickerComponent } from "./Panel";
import { vectorColorPickerTranslations } from "../locale";

export const VECTOR_COLOR_PICKER_ID = "vector-color-picker";

/** Color picker for vector layers (vector tiles, tiled GeoJSON, OGC features). */
export class VectorColorPickerTool implements LayerTool {
    readonly id = VECTOR_COLOR_PICKER_ID;
    readonly localeTranslations = vectorColorPickerTranslations;

    component(nodeId: string): React.ReactNode {
        return <VectorColorPickerComponent nodeId={nodeId} />;
    }
}

/** Registers the tool and links it to the vector protocols it applies to. */
export function registerVectorColorPickerTool(rootStore: StoreRegistry): void {
    rootStore.layerToolStore.registerTool(new VectorColorPickerTool());
    rootStore.layerToolStore.bindToolToProtocol(
        "vector-tile",
        "renderer",
        VECTOR_COLOR_PICKER_ID,
    );
    rootStore.layerToolStore.bindToolToProtocol(
        "geojson-tiled",
        "renderer",
        VECTOR_COLOR_PICKER_ID,
    );
    rootStore.layerToolStore.bindToolToProtocol(
        "ogc-features",
        "renderer",
        VECTOR_COLOR_PICKER_ID,
    );
}
