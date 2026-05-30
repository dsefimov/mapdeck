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
import { Ruler3DComponent } from "./Panel";
import { ruler3dTranslations } from "../locale";

export class Ruler3DTool implements MapTool {
    readonly id = "ruler-3d";
    readonly icon: IconName = "ruler";
    readonly placement: MapToolPlacement = "top-right";
    readonly order = 20;
    readonly localeTranslations = ruler3dTranslations;

    /** Shared measurement state */
    readonly measureStore = new MeasureToolStore();

    readonly component: React.ComponentType<MapToolComponentProps>;

    isActive = false;

    constructor() {
        const store = this.measureStore;
        const Wrapper: React.FC<MapToolComponentProps> = (props) => (
            <Ruler3DComponent {...props} store={store} />
        );
        Wrapper.displayName = "Ruler3DToolComponent";
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

export default Ruler3DTool;
