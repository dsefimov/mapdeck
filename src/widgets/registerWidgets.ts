import type { StoreRegistry } from "@core/store-registry";
import type { Widget } from "@core/contracts";
import MapViewerWidget from "@widgets/map-viewer";
import LayerTreeWidget from "@widgets/layer-tree";
import SettingsWidget from "@widgets/settings";
import SidebarWidget from "@widgets/sidebar";
import {
    ensureAttributeTableState,
    AttributeTableWidget,
} from "@widgets/attribute-table";
import MapToolbarWidget from "@widgets/map-toolbar";

const BUILT_IN_WIDGETS: Widget<{ widgetId: string }>[] = [
    new MapViewerWidget(),
    new SettingsWidget(),
    new LayerTreeWidget(),
    new SidebarWidget(),
    new AttributeTableWidget(),
    new MapToolbarWidget(),
];

/** Explicit registration of built-in widgets into the widget store. */
export function registerWidgets(rootStore: StoreRegistry): void {
    for (const widget of BUILT_IN_WIDGETS) {
        rootStore.widgetStore.registerWidget(widget);
    }
    // Eager, unlike the rest: view-attribute-table reaches the store via
    // stateStore.peek, which cannot create it — it must exist before the
    // widget is ever opened.
    ensureAttributeTableState(rootStore);
}
