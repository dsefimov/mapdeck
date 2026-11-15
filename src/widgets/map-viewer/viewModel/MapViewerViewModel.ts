import type { MapClickPoint } from "@core/domain/map";
import type { MapTool } from "@core/contracts";
import { MAP_TOOL_KIND } from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";

/** The context menu's close surface — the widget's menu instance. */
export interface MenuSurface {
    close(): void;
}

/**
 * View model of the map viewer: the client-to-map
 * click math and the context-menu action policy. The widget is a thin
 * observer; the model survives remounts through the state store.
 */
export class MapViewerViewModel {
    constructor(private readonly rootStore: StoreRegistry) {}

    /** Map click under a client point, or null outside the map container. */
    clientToMapClick(
        clientX: number,
        clientY: number,
    ): MapClickPoint | null {
        const map = this.rootStore.mapStore.getMap();
        if (!map) return null;

        const rect = map.getContainer().getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

        const lngLat = map.unproject([x, y]);
        return {
            lngLat: { lng: lngLat.lng, lat: lngLat.lat },
            screenPoint: { x, y },
        };
    }

    /**
     * The menu's tool action: action tools execute; interactive tools
     * follow their context-menu mode — plain activation, or activation
     * at the remembered right click. The menu closes either way.
     */
    runMenuAction(
        tool: MapTool,
        menu: MenuSurface,
        lastRightClick: MapClickPoint | null,
    ): void {
        if (tool.kind === MAP_TOOL_KIND.action) {
            this.rootStore.mapToolStore.executeTool(tool.id);
        } else if (tool.contextMenu?.mode === "activate-at-point") {
            if (lastRightClick) {
                this.rootStore.mapToolStore.setPendingPoint(lastRightClick);
            }
            this.rootStore.mapToolStore.activateTool(tool.id);
        } else {
            this.rootStore.mapToolStore.toggleTool(tool.id);
        }
        menu.close();
    }
}
