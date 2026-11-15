import type {
    SettingMetadata,
    Widget,
    WidgetSizeConfig,
} from "@core/contracts";
import { readWidgetConfig } from "@core/contracts";
import icon from "@core/ui/icons/layers.svg";
import { layerTreeTranslations } from "./locale";
import LayerTreeComponent from "./components/Widget";
import type { LayerTreeProps } from "./types";
import config from "./config.json";

export const LAYER_TREE_ID = "layer-tree" as const;

/** The layer tree widget: sources, groups and layer nodes with their tools. */
export class LayerTreeWidget implements Widget<LayerTreeProps> {
    readonly id = LAYER_TREE_ID;
    readonly icon = icon;
    readonly localeTranslations = layerTreeTranslations;
    readonly component = LayerTreeComponent;
    readonly showInSidebar: boolean;
    readonly settings: SettingMetadata[];
    readonly size?: WidgetSizeConfig;

    constructor() {
        const { showInSidebar, settings, size } = readWidgetConfig(
            LAYER_TREE_ID,
            config,
        );
        this.showInSidebar = showInSidebar;
        this.settings = settings;
        if (size) {
            this.size = size;
        }
    }
}

export default LayerTreeWidget;
