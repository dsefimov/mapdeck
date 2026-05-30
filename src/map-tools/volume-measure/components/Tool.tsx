import { makeObservable, observable } from "mobx";
import React from "react";
import maplibregl from "maplibre-gl";

import type {
    MapTool,
    MapToolPlacement,
    MapToolComponentProps,
} from "@core/framework/types";
import type { IconName } from "@core/ui/components";
import { VolumeMeasureStore } from "../store/VolumeMeasureStore";
import { VolumeMeasureComponent } from "./Panel";
import { volumeMeasureTranslations } from "../locale";

export class VolumeMeasureTool implements MapTool {
    readonly id = "volume-measure";
    readonly icon: IconName = "volume";
    readonly placement: MapToolPlacement = "top-right";
    readonly order = 40;
    readonly localeTranslations = volumeMeasureTranslations;

    readonly measureStore = new VolumeMeasureStore();

    readonly component: React.ComponentType<MapToolComponentProps>;

    isActive = false;

    constructor() {
        const store = this.measureStore;
        const Wrapper: React.FC<MapToolComponentProps> = (props) => (
            <VolumeMeasureComponent {...props} store={store} />
        );
        Wrapper.displayName = "VolumeMeasureToolComponent";
        this.component = Wrapper;

        makeObservable(this, {
            isActive: observable,
        });
    }

    activate(_map: maplibregl.Map): void {
        this.isActive = true;
        this.measureStore.reset();
    }

    deactivate(): void {
        this.isActive = false;
    }
}

export default VolumeMeasureTool;
