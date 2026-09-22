import React from "react";
import { observer } from "mobx-react-lite";
import { isIconName } from "@core/ui/components";
import { IconButton } from "@core/ui/components/primitives/icon-button/IconButton";
import { LOCALE_KEY_TOOL_NAME, MAP_TOOL_KIND } from "@core/contracts";
import { useRootStore } from "@core/shell";
import type { ToolbarProps } from "../types";
import styles from "../Toolbar.module.css";

/**
 * The map tools toolbar widget: renders the tool buttons in a fixed position
 * over the map. It shows buttons only — an active tool's panel renders outside
 * the shared grid, placed over the map next to the toolbar without chrome, and
 * its visibility follows the tool's active state rather than any widget
 * open/close state.
 */
const ToolbarComponent: (props: ToolbarProps) => React.ReactNode = observer(
    ({ className }) => {
        const rootStore = useRootStore();
        const { mapToolStore, localeStore } = rootStore;

        if (!rootStore.mapStore.context) {
            return null;
        }

        const tools = mapToolStore.toolsList;

        if (tools.length === 0) {
            return null;
        }

        return (
            <div className={`${styles.overlay} ${className ?? ""}`.trim()}>
                <div className={styles.toolbar}>
                    {tools.map((tool) => {
                        const isActive = mapToolStore.isToolActive(tool.id);
                        const toolName =
                            localeStore.t(tool.id)[LOCALE_KEY_TOOL_NAME] ||
                            tool.id;

                        return (
                            <IconButton
                                key={tool.id}
                                icon={isIconName(tool.icon) ? tool.icon : null}
                                label={toolName}
                                variant="tile"
                                size="md"
                                active={isActive}
                                onClick={() => {
                                    if (tool.kind === MAP_TOOL_KIND.action) {
                                        mapToolStore.executeTool(tool.id);
                                    } else {
                                        mapToolStore.toggleTool(tool.id);
                                    }
                                }}
                            />
                        );
                    })}
                </div>
            </div>
        );
    },
);

export default ToolbarComponent;
