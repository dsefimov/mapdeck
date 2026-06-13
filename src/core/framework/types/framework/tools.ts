/**
 * Interfaces for map interaction tools.
 * Pure contracts — no business logic.
 * Part of the framework layer (UI shell).
 */

import type React from "react";
import type maplibregl from "maplibre-gl";
import type { DeckOverlayManager } from "@core/domain/overlay";
import type { RootStore } from "@core/framework/store";
import type { IconName } from "@core/ui/components";
import type { SettingMetadata } from "./settings";
import type { SupportedLanguage, TranslationDict } from "./locale";

export type MapToolPlacement =
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";

/**
 * Declarative behavior of a map tool when invoked from the map context menu.
 *
 * - `"activate"`: activate the tool, user continues interacting with the map.
 * - `"activate-at-point"`: activate and immediately execute at the right-click point.
 */
export type ContextMenuBehavior =
    | { mode: "activate" }
    | { mode: "activate-at-point" };

export interface MapToolComponentProps {
    rootStore: RootStore;
    map: maplibregl.Map;
    overlayManager: DeckOverlayManager;
    deactivate: () => void;
}

/** Base interface shared by all map tools */
export interface BaseMapTool {
    /** Unique identifier for the tool (also used as locale namespace) */
    readonly id: string;
    /** SVG icon name to display in toolbar */
    readonly icon: IconName;
    /** Placement of the tool button in the UI */
    readonly placement?: MapToolPlacement;
    /** Order for sorting tools within the same placement */
    readonly order?: number;
    /** Settings declared by the tool — auto-registered by MapToolStore */
    readonly settings?: SettingMetadata[];
    /** Translation dictionary for the tool's locale (keyed by tool `id`) */
    readonly localeTranslations: Partial<
        Record<SupportedLanguage, TranslationDict>
    >;
}

/** Map tool with activate/deactivate lifecycle and UI component */
export interface MapTool extends BaseMapTool {
    /** Whether the tool is currently active */
    readonly isActive: boolean;
    /** UI component rendered when tool is active */
    readonly component: React.ComponentType<MapToolComponentProps>;
    /**
     * Behavior when invoked from the map context menu.
     * If omitted — defaults to `"activate"`.
     */
    readonly contextMenu?: ContextMenuBehavior;

    /**
     * Activate the tool with the current map instance
     * @param map - Maplibre GL map instance
     */
    activate(map: maplibregl.Map): void;

    /**
     * Deactivate the tool, clean up any event listeners or resources
     * @param map - Optional maplibre GL map instance to unbind events from
     */
    deactivate(map?: maplibregl.Map): void;
}

/** One-shot action tool that executes on click without UI */
export interface MapActionTool extends BaseMapTool {
    /**
     * Execute the action tool. Called when the tool button is clicked.
     * @param rootStore - Root store instance for accessing app state
     */
    execute(rootStore: RootStore): void;
}

/** Union type for all map tools */
export type AnyMapTool = MapTool | MapActionTool;

/** Type guard to check if a tool is a MapTool (has activate/deactivate) */
export function isMapTool(tool: AnyMapTool): tool is MapTool {
    return "activate" in tool && "deactivate" in tool && "component" in tool;
}

/** Type guard to check if a tool is a MapActionTool (has execute) */
export function isMapActionTool(tool: AnyMapTool): tool is MapActionTool {
    return "execute" in tool && !("activate" in tool);
}
