import { MAP_TOOL_KIND } from "@core/contracts";
import type { InteractiveMapTool } from "@core/contracts";
import type { SettingMetadata } from "@core/contracts";
import type { BasemapStore } from "@core/domain/map";
import { BASEMAP_SETTING_ID } from "@core/domain/map";
import { BASEMAP_TOOL_ID } from "../toolId";
import { BasemapComponent } from "./Grid";
import { basemapTranslations } from "../locale";

export class BasemapTool implements InteractiveMapTool {
    readonly id = BASEMAP_TOOL_ID;
    readonly icon = "map";
    readonly kind = MAP_TOOL_KIND.interactive;
    readonly component = BasemapComponent;
    readonly localeTranslations = basemapTranslations;

    /**
     * The setting starts empty on purpose: options and defaults are derived
     * from the registry (the store's setting sync), so a custom assembly
     * without the built-in basemaps never dangles a value it cannot serve.
     */
    readonly settings: SettingMetadata[] = [
        {
            id: BASEMAP_SETTING_ID,
            label: "Basemap",
            type: "select",
            defaultValue: "",
            options: [],
        },
    ];

    constructor(private readonly basemapStore: BasemapStore) {}

    /**
     * Opening the panel is the natural moment to fill missing health
     * statuses — the panel is a view, it does not trigger fetches.
     */
    onActivate(): void {
        this.basemapStore.refreshHealthStatuses();
    }
}
