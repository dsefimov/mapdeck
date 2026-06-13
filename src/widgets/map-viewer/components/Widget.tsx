import { useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/framework/store";
import { MapToolsOverlay } from "@core/framework/ui/map-tools-overlay";
import { ContextMenu, useMapContextMenu } from "@core/ui/components";
import {
    isMapTool,
    isMapActionTool,
    LOCALE_KEY_TOOL_NAME,
    type AnyMapTool,
} from "@core/framework/types";
import type { MapClickPoint } from "@core/framework/store";
import { useMapLifecycle } from "../utils/useMapLifecycle";
import { useMapContextMenuTrigger } from "../utils/useMapContextMenuTrigger";
import type { MapViewerProps } from "../types";
import styles from "./Widget.module.css";

const MapViewerComponent = observer(({ className = "" }: MapViewerProps) => {
    const rootStore = useRootStore();
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useMapLifecycle(mapContainerRef, rootStore);
    const contextMenu = useMapContextMenu();
    const lastRightClickRef = useRef<MapClickPoint | null>(null);

    useMapContextMenuTrigger(mapRef, contextMenu, lastRightClickRef);

    const handleToolClick = (tool: AnyMapTool) => {
        if (isMapActionTool(tool)) {
            rootStore.mapToolStore.executeTool(tool.id);
        } else if (isMapTool(tool)) {
            const mode = tool.contextMenu?.mode ?? "activate";

            switch (mode) {
                case "activate":
                    rootStore.mapToolStore.toggleTool(tool.id);
                    break;
                case "activate-at-point":
                    if (lastRightClickRef.current) {
                        rootStore.mapToolStore.setPendingPoint(
                            lastRightClickRef.current,
                        );
                    }
                    rootStore.mapToolStore.activateTool(tool.id);
                    break;
            }
        }
        contextMenu.close();
    };

    const tools = rootStore.mapToolStore.toolsList;
    const activeToolId = rootStore.mapToolStore.activeToolId;
    const dict = rootStore.localeStore.t("core");

    const containerClassName = [styles.mapViewer, className]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={containerClassName}>
            <div ref={mapContainerRef} className={styles.mapContainer} />
            <MapToolsOverlay />
            <ContextMenu
                isOpen={contextMenu.isOpen}
                position={contextMenu.position}
                onClose={contextMenu.close}
                tools={tools}
                activeToolId={activeToolId}
                onToolClick={handleToolClick}
                dict={dict}
                resolveToolName={(id) =>
                    rootStore.localeStore.t(id)[LOCALE_KEY_TOOL_NAME] ?? id
                }
            />
        </div>
    );
});

export default MapViewerComponent;
