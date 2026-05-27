import type { RootStore } from "@core/framework/store";
import type { Widget } from "@core/framework/types";
import AttributeTableWidget from "@widgets/attribute-table";
import LayerTree from "@widgets/layer-tree";
import MapViewer from "@widgets/map-viewer";
import SettingsWidget from "@widgets/settings";
import Sidebar from "@widgets/sidebar";

const BUILT_IN_WIDGETS: Widget[] = [
    MapViewer,
    SettingsWidget,
    LayerTree,
    Sidebar,
    AttributeTableWidget,
];

export async function registerBuiltInWidgets(
    rootStore: RootStore,
): Promise<void> {
    for (const widget of BUILT_IN_WIDGETS) {
        await rootStore.catalogStore.registerWidget(widget);
    }
}
