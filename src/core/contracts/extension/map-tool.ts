/**
 * One map-tool contract, discriminated by `kind`.
 * Pure contracts — no business logic.
 *
 * Every map tool is a class instance implementing one of the two
 * variants; the discriminant keeps the compile-time guarantee that every
 * registered tool has exactly one capability. The store and the toolbar
 * branch on `kind`.
 */

import type React from "react";
import type maplibregl from "maplibre-gl";
import type { Layer } from "@deck.gl/core";
import type { OverlayManager } from "../domain/map-context";
import type { ToolRuntimeContext } from "./context";
import type { SettingMetadata } from "./settings";
import type { TranslationDict } from "./locale";

/**
 * Declarative behavior of a map tool when invoked from the map context menu.
 *
 * - `"activate"`: activate the tool, user continues interacting with the map.
 * - `"activate-at-point"`: activate and immediately execute at the right-click point.
 */
export type ContextMenuBehavior =
    | { mode: "activate" }
    | { mode: "activate-at-point" };

/**
 * Props of a map tool's panel. The store registry is deliberately absent —
 * panels receive the declared-points runtime context, the map
 * engine (platform technology), and the overlay port.
 */
export interface MapToolComponentProps {
    context: ToolRuntimeContext;
    map: maplibregl.Map;
    overlayManager: OverlayManager<Layer>;
    deactivate: () => void;
}

/** What an action tool receives on execution. */
export interface ActionToolInvocation {
    context: ToolRuntimeContext;
    map: maplibregl.Map;
}

/**
 * Discriminant values of the {@link MapTool} union — the single source for
 * every `kind` comparison in stores and UI. Branching reads this constant,
 * never a bare string.
 */
export const MAP_TOOL_KIND = {
    interactive: "interactive",
    action: "action",
} as const;

/** The kind discriminant of the {@link MapTool} union. */
export type MapToolKind = (typeof MAP_TOOL_KIND)[keyof typeof MAP_TOOL_KIND];

/** A map click pending consumption by an activating tool (context-menu flow). */
export interface MapClickPoint {
    /** Geographic coordinates of the click */
    lngLat: { lng: number; lat: number };
    /** Pixel coordinates on the map canvas (used by featureCollector) */
    screenPoint: { x: number; y: number };
}

/**
 * Runtime-slice port over the tool system's own state: the
 * pending-point handoff between the map context menu and an activating tool.
 */
export interface MapToolStatePort {
    readonly pendingPoint: MapClickPoint | null;
    consumePendingPoint(): MapClickPoint | null;
}

/** Shared fields of every map tool. The id doubles as the locale namespace. */
interface BaseMapTool {
    /** Unique identifier for the tool (also used as locale namespace) */
    readonly id: string;
    /**
     * SVG icon name to display in the toolbar. A plain string — the ui and
     * contracts layers must not import each other; consumers validate with
     * the ui kit's `isIconName`.
     */
    readonly icon: string;
    /** Settings declared by the tool — auto-registered by MapToolStore */
    readonly settings?: SettingMetadata[];
    /** Translation dictionary for the tool's locale (keyed by tool `id`) */
    readonly localeTranslations: Partial<
        Record<string, TranslationDict>
    >;
}

/** Interactive map tool: toggled activation, an optional panel, optional hooks. */
export interface InteractiveMapTool extends BaseMapTool {
    readonly kind: typeof MAP_TOOL_KIND.interactive;
    /** UI component rendered when tool is active */
    readonly component: React.ComponentType<MapToolComponentProps>;
    /**
     * Behavior when invoked from the map context menu.
     * If omitted — defaults to `"activate"`.
     */
    readonly contextMenu?: ContextMenuBehavior;

    /**
     * Optional activation hook — present only on tools with real activation
     * logic (e.g. reaction setup). Active state renders from
     * `MapToolStore.activeToolId`, not from a tool field.
     * @param map - Maplibre GL map instance
     */
    onActivate?(map: maplibregl.Map): void;

    /**
     * Optional deactivation hook — cleans up resources the tool set up in
     * `onActivate`.
     * @param map - Optional maplibre GL map instance to unbind events from
     */
    onDeactivate?(map?: maplibregl.Map): void;
}

/** One-shot action tool that executes on click without UI or active state. */
export interface ActionMapTool extends BaseMapTool {
    readonly kind: typeof MAP_TOOL_KIND.action;
    /**
     * Execute the action tool. Called when the tool button is clicked.
     * @param invocation - The runtime context and the current map
     */
    execute(invocation: ActionToolInvocation): void;
}

/** The single map-tool contract name module authors learn. */
export type MapTool = InteractiveMapTool | ActionMapTool;
