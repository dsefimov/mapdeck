import { makeAutoObservable } from "mobx";
import type maplibregl from "maplibre-gl";

import { logger } from "@core/shared/diagnostics/logger";
import type { AnyMapTool } from "@core/framework/types";
import {
    isMapTool,
    isMapActionTool,
    LOCALE_KEY_TOOL_NAME,
} from "@core/framework/types";
import type { RootStore } from "@core/framework/store";

export interface MapClickPoint {
    /** Geographic coordinates of the click */
    lngLat: { lng: number; lat: number };
    /** Pixel coordinates on the map canvas (used by featureCollector) */
    screenPoint: { x: number; y: number };
}

/**
 * Store for managing map interaction tools.
 * Tools are activated/deactivated explicitly via onMapChanged()
 * rather than through MobX reactions.
 */
export class MapToolStore {
    /** Registered tools indexed by their ID */
    private tools = new Map<string, AnyMapTool>();
    /** Currently active tool ID (null if no tool is active) */
    activeToolId: string | null = null;
    /** Current map reference (set via onMapChanged) */
    private _currentMap: maplibregl.Map | null = null;
    /** Observable — позволяет MobX-реакциям следить за изменением */
    private _pendingPoint: MapClickPoint | null = null;

    constructor(readonly rootStore: RootStore) {
        makeAutoObservable<this, "_currentMap">(this, {
            rootStore: false,
            _currentMap: false,
        });
    }

    get pendingPoint(): MapClickPoint | null {
        return this._pendingPoint;
    }

    /**
     * Called by MapStore when the map instance changes.
     * Deactivates the active tool on the old map and activates it on the new map.
     */
    onMapChanged(newMap: maplibregl.Map | null): void {
        const prevActiveToolId = this.activeToolId;

        this.deactivateTool();
        this._currentMap = newMap;

        if (newMap && prevActiveToolId) {
            this.activateTool(prevActiveToolId);
        }
    }

    /**
     * Register a new map tool.
     * Auto-registers any settings declared by the tool.
     */
    registerTool(tool: AnyMapTool): void {
        if (this.tools.has(tool.id)) {
            logger.warn(`Tool with ID "${tool.id}" is already registered`);
            return;
        }

        const toolDisplayName =
            this.rootStore.localeStore.t(tool.id)[LOCALE_KEY_TOOL_NAME] ||
            tool.id;

        this.tools.set(tool.id, tool);
        logger.debug(`Registered map tool: ${toolDisplayName} (${tool.id})`);

        // Auto-register tool settings
        tool.settings?.forEach((setting) => {
            this.rootStore.settingsStore.registerSetting(
                tool.id,
                toolDisplayName,
                setting,
            );
            logger.debug(
                `Registered setting "${setting.id}" for tool "${tool.id}"`,
            );
        });
    }

    /**
     * Activate a specific tool (only for MapTool, not MapActionTool).
     * Always uses the current map; call onMapChanged first to set the map reference.
     */
    activateTool(toolId: string): void {
        const tool = this.tools.get(toolId);
        if (!tool || !isMapTool(tool)) {
            logger.warn(`Tool "${toolId}" not found or is not a MapTool`);
            return;
        }

        this.deactivateTool();

        this.activeToolId = toolId;
        logger.debug(`Activated map tool: ${tool.id} (${toolId})`);

        if (this._currentMap) {
            tool.activate(this._currentMap);
        }
    }

    /**
     * Deactivate the currently active tool
     */
    deactivateTool(): void {
        if (!this.activeToolId) return;

        const tool = this.tools.get(this.activeToolId);
        if (tool && isMapTool(tool)) {
            tool.deactivate();
            logger.debug(
                `Deactivated map tool: ${tool.id} (${this.activeToolId})`,
            );
        }

        this.activeToolId = null;
    }

    /**
     * Toggle a tool - activate if not active, deactivate if active
     */
    toggleTool(toolId: string): void {
        if (this.activeToolId === toolId) {
            this.deactivateTool();
        } else {
            this.activateTool(toolId);
        }
    }

    /** Get all registered tools */
    get toolsList(): AnyMapTool[] {
        return Array.from(this.tools.values());
    }

    /** Check if a specific tool is active */
    isToolActive(toolId: string): boolean {
        return this.activeToolId === toolId;
    }

    /**
     * Execute an action tool
     */
    executeTool(toolId: string): void {
        const tool = this.tools.get(toolId);
        if (!tool) {
            logger.warn(`Cannot execute tool: tool "${toolId}" not found`);
            return;
        }
        if (!isMapActionTool(tool)) {
            logger.warn(
                `Tool "${toolId}" is not a MapActionTool, use activateTool instead`,
            );
            return;
        }
        tool.execute(this.rootStore);
        logger.debug(`Executed action tool: ${tool.id} (${toolId})`);
    }

    /**
     * Save the map point before activating a tool from the context menu.
     */
    setPendingPoint(point: MapClickPoint): void {
        this._pendingPoint = point;
    }

    consumePendingPoint(): MapClickPoint | null {
        const p = this._pendingPoint;
        this._pendingPoint = null;
        return p;
    }
}
