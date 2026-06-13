import { makeObservable, observable } from "mobx";
import type maplibregl from "maplibre-gl";
import type {
    MapTool,
    MapToolPlacement,
    ContextMenuBehavior,
} from "@core/framework/types";
import type { IconName } from "@core/ui/components";
import { FeatureInfoComponent } from "./Panel";
import { featureInfoTranslations } from "../locale";

/**
 * MapTool implementation for feature information.
 * Click on the map to get information about objects at the clicked location.
 */
export class FeatureInfoTool implements MapTool {
    readonly id = "feature-info";
    readonly icon: IconName = "info";
    readonly placement: MapToolPlacement = "top-right";
    readonly order = 10;
    readonly component = FeatureInfoComponent;
    readonly contextMenu: ContextMenuBehavior = { mode: "activate-at-point" };
    readonly localeTranslations = featureInfoTranslations;

    isActive = false;

    constructor() {
        makeObservable(this, {
            isActive: observable,
        });
    }

    activate(_map: maplibregl.Map): void {
        this.isActive = true;
    }

    deactivate(): void {
        this.isActive = false;
    }
}
