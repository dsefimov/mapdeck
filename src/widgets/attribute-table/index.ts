import type { Widget, WidgetSizeConfig } from "@core/contracts";
import { readWidgetConfig } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";
import icon from "@core/ui/icons/attribute-table.svg";
import { attributeTableTranslations } from "./locale";
import AttributeTableComponent from "./components/Widget";
import { AttributeTableStore } from "./store/AttributeTableStore";
import type { AttributeTableWidgetProps } from "./types";
import config from "./config.json";

/** The widget's id — owned here; openers coordinate through stateStore keyed by it. */
export const ATTRIBUTE_TABLE_WIDGET_ID = "attribute-table-widget";

/**
 * Creates the widget's persistent state up front, so openers can prepare
 * it (e.g. select a layer) before the widget is ever shown.
 */
export function ensureAttributeTableState(rootStore: StoreRegistry): void {
    rootStore.stateStore.get(
        ATTRIBUTE_TABLE_WIDGET_ID,
        () => new AttributeTableStore(rootStore),
    );
}

/** The attribute table widget for a selected layer's feature data. */
export class AttributeTableWidget implements Widget<AttributeTableWidgetProps> {
    readonly id = ATTRIBUTE_TABLE_WIDGET_ID;
    readonly icon = icon;
    readonly localeTranslations = attributeTableTranslations;
    readonly component = AttributeTableComponent;
    readonly showInSidebar: boolean;
    readonly size?: WidgetSizeConfig;

    constructor() {
        const { showInSidebar, size } = readWidgetConfig(
            ATTRIBUTE_TABLE_WIDGET_ID,
            config,
        );
        this.showInSidebar = showInSidebar;
        if (size) {
            this.size = size;
        }
    }
}

export default AttributeTableWidget;
export type { AttributeTableWidgetProps } from "./types";
