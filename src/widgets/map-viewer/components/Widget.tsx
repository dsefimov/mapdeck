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
import { useMapLifecycle } from "../utils/useMapLifecycle";
import { useMapContextMenuTrigger } from "../utils/useMapContextMenuTrigger";
import type { MapViewerProps } from "../types";
import styles from "./Widget.module.css";

const MapViewerComponent = observer(({ className = "" }: MapViewerProps) => {
    const rootStore = useRootStore();
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useMapLifecycle(mapContainerRef, rootStore);
    const contextMenu = useMapContextMenu();

    useMapContextMenuTrigger(mapRef, contextMenu);

    const handleToolClick = (tool: AnyMapTool) => {
        if (isMapTool(tool)) {
            rootStore.mapToolStore.toggleTool(tool.id);
        } else if (isMapActionTool(tool)) {
            rootStore.mapToolStore.executeTool(tool.id);
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
