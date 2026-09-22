import { makeAutoObservable } from "mobx";
import type maplibregl from "maplibre-gl";

import { logger } from "@core/lib/logger";
import { Registry, type RegisterOptions } from "@core/lib/registry";
import type { MapTool } from "@core/contracts";
import {
    LOCALE_KEY_TOOL_NAME,
    MAP_TOOL_KIND,
    type MapClickPoint,
} from "@core/contracts";
import type { StoreRegistry } from "@core/store-registry";

export type { MapClickPoint } from "@core/contracts";

/**
 * Store for managing map interaction tools.
 * Tools are activated/deactivated explicitly via onMapChanged()
 * rather than through MobX reactions.
 */
export class MapToolStore {
    /** Registered tools indexed by their ID */
    private tools = new Registry<MapTool>();
    /** Currently active tool ID (null if no tool is active) */
    activeToolId: string | null = null;
    /** Current map reference (set via onMapChanged) */
    private _currentMap: maplibregl.Map | null = null;
    /** Observable — lets MobX reactions track changes */
    private _pendingPoint: MapClickPoint | null = null;

    constructor(readonly rootStore: StoreRegistry) {
        makeAutoObservable<this, "_currentMap" | "tools">(this, {
            rootStore: false,
            _currentMap: false,
            tools: false,
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
     * Registering a duplicate id throws unless `opts.override` (ADR-0005).
     */
    registerTool(tool: MapTool, opts?: RegisterOptions): void {
        this.tools.register(tool, opts);

        const toolDisplayName =
            this.rootStore.localeStore.t(tool.id)[LOCALE_KEY_TOOL_NAME] ||
            tool.id;

        logger.debug(`Registered map tool: ${toolDisplayName} (${tool.id})`);

        this.rootStore.settingsStore.registerSettings(
            tool.id,
            toolDisplayName,
            tool.settings ?? [],
        );
    }

    /**
     * Activate a specific tool (only for MapTool, not MapActionTool).
     * Always uses the current map; call onMapChanged first to set the map reference.
     * On an activation-hook failure the previously active tool is restored and
     * the failed tool is left inactive.
     */
    activateTool(toolId: string): void {
        const tool = this.tools.get(toolId);
        if (!tool || tool.kind !== MAP_TOOL_KIND.interactive) {
            logger.warn(`Tool "${toolId}" not found or is not interactive`);
            return;
        }

        const prevActiveToolId = this.activeToolId;
        this.deactivateTool();

        this.activeToolId = toolId;
        logger.debug(`Activated map tool: ${tool.id} (${toolId})`);

        if (this._currentMap) {
            try {
                tool.onActivate?.(this._currentMap);
            } catch (error) {
                logger.error(`Failed to activate tool "${toolId}":`, error);
                this.activeToolId = null;
                if (prevActiveToolId) {
                    this.activateTool(prevActiveToolId);
                }
            }
        }
    }

    /**
     * Deactivate the currently active tool
     */
    deactivateTool(): void {
        if (!this.activeToolId) return;

        const tool = this.tools.get(this.activeToolId);
        if (tool && tool.kind === MAP_TOOL_KIND.interactive) {
            tool.onDeactivate?.();
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
    get toolsList(): MapTool[] {
        return this.tools.getAll();
    }

    /** Check if a specific tool is active */
    isToolActive(toolId: string): boolean {
        return this.activeToolId === toolId;
    }

    /** Releases the active tool's listeners (ADR-0003); registration survives. */
    dispose(): void {
        this.deactivateTool();
        this._currentMap = null;
    }

    /**
     * Execute an action tool
     */
    executeTool(toolId: string): void {
        const tool = this.tools.get(toolId);
        if (!tool) {
            logger.warn(`Cannot execute action tool: tool "${toolId}" not found`);
            return;
        }
        if (tool.kind !== MAP_TOOL_KIND.action) {
            logger.warn(
                `Tool "${toolId}" is not an action tool, use activateTool instead`,
            );
            return;
        }
        if (!this._currentMap) {
            logger.warn(`Cannot execute action tool "${toolId}": no map`);
            return;
        }
        tool.execute({
            context: this.rootStore.toolContext,
            map: this._currentMap,
        });
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
