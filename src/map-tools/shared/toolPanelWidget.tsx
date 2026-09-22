import React from "react";
import { observer } from "mobx-react-lite";
import type { InteractiveMapTool, Widget } from "@core/contracts";
import { MAP_TOOL_KIND } from "@core/contracts";
import { useRootStore } from "@core/shell";
import styles from "./toolPanelWidget.module.css";

/**
 * Renders an active map tool's panel over the map, like the toolbar: the
 * widget's own component renders directly (no window chrome) and positions
 * itself with CSS. Rendered only while the tool is active.
 */
const ToolPanelWidget: (props: {
    widgetId: string;
    className?: string;
}) => React.ReactNode = observer(({ widgetId }) => {
    const rootStore = useRootStore();
    const { mapToolStore, mapStore } = rootStore;

    const ctx = mapStore.context;
    if (!ctx || !mapToolStore.isToolActive(widgetId)) {
        return null;
    }

    const tool = mapToolStore.toolsList.find(
        (t): t is InteractiveMapTool => t.id === widgetId && t.kind === MAP_TOOL_KIND.interactive,
    );
    if (!tool) {
        return null;
    }

    const ToolComponent = tool.component;
    return (
        <div className={styles.panelPosition}>
            <ToolComponent
                context={rootStore.toolContext}
                map={ctx.map}
                overlayManager={ctx.overlayManager}
                deactivate={() => mapToolStore.deactivateTool()}
            />
        </div>
    );
});

/**
 * Builds the map-toolbar widget that hosts a map tool's panel. Rendered over
 * the map next to the toolbar (same placement as the toolbar itself); the
 * panel is visible only while its tool is active.
 */
export function createToolPanelWidget(
    tool: InteractiveMapTool,
): Widget<{ widgetId: string; className?: string }> {
    return {
        id: tool.id,
        icon: tool.icon,
        placement: "map-toolbar",
        showInSidebar: false,
        component: ToolPanelWidget,
    };
}
