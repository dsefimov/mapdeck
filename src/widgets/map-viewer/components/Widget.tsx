import { useRef, type MouseEvent as ReactMouseEvent } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import { ContextMenu, useContextMenu } from "@core/ui/components";
import { LOCALE_KEY_TOOL_NAME } from "@core/contracts";
import type { MapClickPoint } from "@core/domain/map";
import { useMapLifecycle } from "../utils/useMapLifecycle";
import { useMapContextMenuTrigger } from "../utils/useMapContextMenuTrigger";
import { MapViewerViewModel } from "../viewModel/MapViewerViewModel";
import { MAP_VIEWER_ID } from "../index";
import type { MapViewerProps } from "../types";
import styles from "./Widget.module.css";

const MapViewerComponent = observer(({ className = "" }: MapViewerProps) => {
    const rootStore = useRootStore();
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useMapLifecycle(mapContainerRef, rootStore);
    const contextMenu = useContextMenu();
    const lastRightClickRef = useRef<MapClickPoint | null>(null);

    useMapContextMenuTrigger(mapRef, contextMenu, lastRightClickRef);

    const viewModel = rootStore.stateStore.get(
        "map-viewer",
        () => new MapViewerViewModel(rootStore),
    );

    // Thin handlers: the click math and the menu policy live in the view
    // model.
    const handleReposition = (e: ReactMouseEvent) => {
        const point = viewModel.clientToMapClick(e.clientX, e.clientY);
        if (!point) return;
        lastRightClickRef.current = point;
        contextMenu.open({ x: e.clientX, y: e.clientY });
    };

    const tools = rootStore.mapToolStore.toolsList;
    const handleSelect = (id: string) => {
        const tool = tools.find((t) => t.id === id);
        if (tool) {
            viewModel.runMenuAction(tool, contextMenu, lastRightClickRef.current);
        }
    };

    const items = tools.map((tool) => ({
        id: tool.id,
        label:
            rootStore.localeStore.t(tool.id)[LOCALE_KEY_TOOL_NAME] ?? tool.id,
    }));
    const activeToolId = rootStore.mapToolStore.activeToolId;
    const header =
        rootStore.localeStore.t(MAP_VIEWER_ID)["contextMenu.header"] ??
        "Map Tools";

    const containerClassName = [styles.mapViewer, className]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={containerClassName}>
            <div ref={mapContainerRef} className={styles.mapContainer} />
            <ContextMenu
                position={contextMenu.position}
                items={items}
                activeItemId={activeToolId}
                header={header}
                onSelect={handleSelect}
                onClose={contextMenu.close}
                onReposition={handleReposition}
            />
        </div>
    );
});

export default MapViewerComponent;
