import { makeObservable, observable } from "mobx";
import React from "react";
import maplibregl from "maplibre-gl";

import type {
    MapTool,
    MapToolPlacement,
    MapToolComponentProps,
} from "@core/framework/types";
import type { IconName } from "@core/ui/components";
import { MeasureToolStore } from "@map-tools/shared/MeasureToolStore";
import { AreaMeasureComponent } from "./Panel";
import { areaMeasureTranslations } from "../locale";

export class AreaMeasureTool implements MapTool {
    readonly id = "area-measure";
    readonly icon: IconName = "area";
    readonly placement: MapToolPlacement = "top-right";
    readonly order = 30;
    readonly localeTranslations = areaMeasureTranslations;

    readonly measureStore = new MeasureToolStore();

    readonly component: React.ComponentType<MapToolComponentProps>;

    isActive = false;

    constructor() {
        const store = this.measureStore;
        const Wrapper: React.FC<MapToolComponentProps> = (props) => (
            <AreaMeasureComponent {...props} store={store} />
        );
        Wrapper.displayName = "AreaMeasureToolComponent";
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

export default AreaMeasureTool;
