import type { RootStore } from "@core/framework/store";
import { rasterOpacityTool } from "./raster-opacity";
import { pointSizeTool } from "./point-size-slider";
import { pointColorSchemeTool } from "./point-color-scheme";
import { viewAttributeTableTools } from "./view-attribute-table";
import { vectorColorPickerTool } from "./vector-color-picker/components/Tool";

/**
 * All built-in layer tools.
 * Add new tools here by importing their declarative definition.
 */
const BUILT_IN_TOOLS = [
    ...viewAttributeTableTools,
    rasterOpacityTool,
    pointSizeTool,
    pointColorSchemeTool,
    vectorColorPickerTool,
];

/**
 * Register all built-in layer tools
 * @param rootStore - Root store instance
 */
export async function registerTools(rootStore: RootStore): Promise<void> {
    for (const tool of BUILT_IN_TOOLS) {
        if (tool.localeTranslations) {
            rootStore.localeStore.registerTranslations(
                tool.id,
                tool.localeTranslations,
            );
        }
        rootStore.layerToolStore.registerTool(tool);
    }
}
