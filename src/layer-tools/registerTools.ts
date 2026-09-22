import type { StoreRegistry } from "@core/store-registry";
import { registerRasterOpacityTool } from "./raster-opacity/components/Tool";
import { registerPointSizeTool } from "./point-size-slider/components/Tool";
import { registerPointColorSchemeTool } from "./point-color-scheme/components/Tool";
import { registerViewAttributeTableTool } from "./view-attribute-table/components/Tool";
import { registerVectorColorPickerTool } from "./vector-color-picker/components/Tool";

/**
 * Explicit registration of core layer tools.
 * Each tool's registration function registers the tool and establishes its
 * protocol bindings via ToolStore.bindToolToProtocol.
 */
export async function registerTools(rootStore: StoreRegistry): Promise<void> {
    registerRasterOpacityTool(rootStore);
    registerPointSizeTool(rootStore);
    registerPointColorSchemeTool(rootStore);
    registerVectorColorPickerTool(rootStore);
    registerViewAttributeTableTool(rootStore);
}
