import type { StoreRegistry } from "@core/store-registry";
import { MAP_TOOL_KIND } from "@core/contracts";
import { createToolPanelWidget } from "./shared/toolPanelWidget";
import { Ruler3DTool } from "./ruler-3d";
import { AreaMeasureTool } from "./area-measure";
import { VolumeMeasureTool } from "./volume-measure";
import { BasemapTool } from "./basemap";
import { ResetOrientationTool } from "./reset-orientation";
import { FeatureInfoTool } from "./feature-info";

/** Explicit registration of map tools: locale, tool and the panel widget. */
export function registerMapTools(rootStore: StoreRegistry): void {
    const tools = [
        new ResetOrientationTool(),
        Ruler3DTool,
        AreaMeasureTool,
        VolumeMeasureTool,
        new BasemapTool(rootStore.basemapStore),
        new FeatureInfoTool(),
    ];

    for (const tool of tools) {
        rootStore.localeStore.registerTranslations(
            tool.id,
            tool.localeTranslations,
        );
        rootStore.mapToolStore.registerTool(tool);
        if (tool.kind === MAP_TOOL_KIND.interactive) {
            rootStore.widgetStore.registerWidget(createToolPanelWidget(tool));
        }
    }
}
