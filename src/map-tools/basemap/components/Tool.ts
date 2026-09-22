import { MAP_TOOL_KIND } from "@core/contracts";
import type { InteractiveMapTool } from "@core/contracts";
import type { SettingMetadata } from "@core/contracts";
import type { BasemapStore } from "@core/domain/map";
import { BASEMAP_SETTING_ID } from "@core/domain/map";
import { BASEMAP_TOOL_ID } from "../toolId";
import { BasemapComponent } from "./Grid";
import { loadBasemapConfigs } from "../loadBasemapConfigs";
import { basemapTranslations } from "../locale";

const basemapConfigs = loadBasemapConfigs();

export class BasemapTool implements InteractiveMapTool {
    readonly id = BASEMAP_TOOL_ID;
    readonly icon = "map";
    readonly kind = MAP_TOOL_KIND.interactive;
    readonly component = BasemapComponent;
    readonly settings: SettingMetadata[];
    readonly localeTranslations = basemapTranslations;

    constructor(private readonly basemapStore: BasemapStore) {
        const basemaps = basemapConfigs.map((bm) => ({
            label: bm.name,
            value: bm.id,
        }));

        this.settings = [
            {
                id: BASEMAP_SETTING_ID,
                label: "Basemap",
                type: "select",
                defaultValue: basemaps[0]?.value ?? basemapConfigs[0]?.id ?? "",
                options: basemaps,
            },
        ];
    }

    /**
     * Opening the panel is the natural moment to fill missing health
     * statuses — the panel is a view, it does not trigger fetches.
     */
    onActivate(): void {
        this.basemapStore.refreshHealthStatuses();
    }
}
