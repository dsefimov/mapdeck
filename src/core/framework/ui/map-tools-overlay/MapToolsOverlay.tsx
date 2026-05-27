import React from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/framework/store";
import { Icon } from "@core/ui/components";
import type { AnyMapTool, MapTool } from "@core/framework/types";
import {
    isMapTool,
    isMapActionTool,
    LOCALE_KEY_TOOL_NAME,
} from "@core/framework/types";
import styles from "./MapToolsOverlay.module.css";

export const MapToolsOverlay: () => React.ReactNode = observer(() => {
    const rootStore = useRootStore();
    const ctx = rootStore.mapStore.context;

    if (!ctx) {
        return null;
    }

    const tools = rootStore.mapToolStore.toolsList as AnyMapTool[];

    if (tools.length === 0) {
        return null;
    }

    // Find active tool with component
    const activeToolWithComponent = tools.find(
        (tool: AnyMapTool) =>
            rootStore.mapToolStore.isToolActive(tool.id) &&
            isMapTool(tool) &&
            tool.component,
    ) as MapTool | undefined;

    return (
        <div className={styles.overlay}>
            <div className={styles.toolbar}>
                {tools.map((tool: AnyMapTool) => {
                    const isActive = rootStore.mapToolStore.isToolActive(
                        tool.id,
                    );
                    const buttonClassName = [
                        styles.toolButton,
                        isActive ? styles.toolButtonActive : "",
                    ]
                        .filter(Boolean)
                        .join(" ");

                    const toolName =
                        rootStore.localeStore.t(tool.id)[
                            LOCALE_KEY_TOOL_NAME
                        ] || tool.id;

                    return (
                        <button
                            key={tool.id}
                            type="button"
                            className={buttonClassName}
                            title={toolName}
                            aria-label={toolName}
                            aria-pressed={isActive}
                            onClick={() => {
                                if (isMapActionTool(tool)) {
                                    rootStore.mapToolStore.executeTool(tool.id);
                                } else {
                                    rootStore.mapToolStore.toggleTool(tool.id);
                                }
                            }}
                        >
                            <Icon
                                name={tool.icon}
                                className={styles.toolIcon ?? ""}
                            />
                        </button>
                    );
                })}
            </div>
            {activeToolWithComponent && activeToolWithComponent.component && (
                <div
                    className={styles.toolComponentContainer}
                    data-tool-id={activeToolWithComponent.id}
                >
                    <activeToolWithComponent.component
                        rootStore={rootStore}
                        map={ctx.map}
                        overlayManager={ctx.overlayManager}
                        deactivate={() =>
                            rootStore.mapToolStore.deactivateTool()
                        }
                    />
                </div>
            )}
        </div>
    );
});

export default MapToolsOverlay;
