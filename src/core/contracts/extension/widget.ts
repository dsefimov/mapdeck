/**
 * Core widget interface that all widgets must implement
 * This defines the metadata and contract for widgets in the Mapdeck system
 */

import type React from "react";
import type { SettingMetadata } from "./settings";
import type { SupportedLanguage, TranslationDict } from "./locale";

/** A widget's render function over its props. */
export type WidgetComponent<TProps> = (
    props: TProps,
) => React.ReactNode | Promise<React.ReactNode>;

/** Where a widget renders: in the shared grid or over the map (toolbar). */
export type WidgetPlacement = "grid" | "map-toolbar";

/** Contract every widget implements: id, component, and optional groups. */
export interface Widget<TProps extends { widgetId: string }> {
    // === Required Properties ===
    readonly id: string;
    readonly icon: string;
    readonly component: WidgetComponent<TProps>;

    // === Optional Size Constraints (grouped) ===
    /**
     * Size configuration (grid units), falling back to core defaults per
     * field, or `"auto"` to adapt the size to the widget's content.
     */
    readonly size?: WidgetSizeConfig | "auto";

    /** Where the widget renders (default: `"grid"`) */
    readonly placement?: WidgetPlacement;

    /** Pins the widget: no move, no resize, no close (default: `false`) */
    readonly fixed?: boolean;

    /** Whether the widget should appear in the sidebar (default: true) */
    readonly showInSidebar?: boolean;

    /** Optional locale translations keyed by language */
    readonly localeTranslations?: Partial<
        Record<SupportedLanguage, TranslationDict>
    >;

    /** Settings metadata for automatic registration */
    readonly settings?: SettingMetadata[];
}

/** Stored widget shape — the grid renders with `widgetId` plus `className`. */
export type StoredWidget = Widget<{ widgetId: string; className?: string }>;

/**
 * Widget size configuration schema (nullable fields for optional configuration)
 */
export interface WidgetSizeConfig {
    /** Default width in grid columns */
    defaultWidth?: number | null;
    /** Default height in grid rows */
    defaultHeight?: number | null;
    /** Minimum width in grid columns */
    minWidth?: number | null;
    /** Minimum height in grid rows */
    minHeight?: number | null;
    /** Maximum width in grid columns */
    maxWidth?: number | null;
    /** Maximum height in grid rows */
    maxHeight?: number | null;
    /** Lock aspect ratio during resize */
    lockAspectRatio?: boolean;
    /** Aspect ratio value (width / height), used if lockAspectRatio is true */
    aspectRatio?: number;
}

/** What readWidgetConfig resolves out of a widget's JSON config. */
export interface WidgetConfigGroups {
    /** Whether the widget appears in the sidebar (default: true) */
    showInSidebar: boolean;
    /** Settings metadata for automatic registration */
    settings: SettingMetadata[];
    /** Size constraints, present only when the config carries them */
    size?: WidgetSizeConfig;
}

/**
 * Reads a widget's optional groups out of its authored JSON config. The
 * asset lives in-repo, so a malformed entry is a programming error that
 * fails loudly at startup — with the widget's id in the message, not as
 * a silent runtime break deep in widget construction.
 */
export function readWidgetConfig(
    widgetId: string,
    config: unknown,
): WidgetConfigGroups {
    if (config === undefined) {
        return { showInSidebar: true, settings: [] };
    }
    if (!config || typeof config !== "object") {
        throw new Error(
            `Widget config for "${widgetId}" must be an object or absent`,
        );
    }
    const record = config as Record<string, unknown>;

    const settings = readSettings(widgetId, record.settings);
    const size = readSize(widgetId, record.size);
    return {
        showInSidebar: readShowInSidebar(widgetId, record.base),
        settings,
        ...(size !== undefined ? { size } : {}),
    };
}

function readShowInSidebar(
    widgetId: string,
    base: unknown,
): boolean {
    if (base !== undefined && (typeof base !== "object" || base === null)) {
        throw new Error(
            `Widget config for "${widgetId}": "base" must be an object`,
        );
    }
    const showInSidebar =
        (base as Record<string, unknown> | undefined)?.showInSidebar;
    if (showInSidebar !== undefined && typeof showInSidebar !== "boolean") {
        throw new Error(
            `Widget config for "${widgetId}": "base.showInSidebar" must be a boolean`,
        );
    }
    return showInSidebar ?? true;
}

function readSettings(
    widgetId: string,
    settings: unknown,
): SettingMetadata[] {
    if (settings === undefined) return [];
    if (!Array.isArray(settings)) {
        throw new Error(
            `Widget config for "${widgetId}": "settings" must be an array`,
        );
    }
    for (const setting of settings) {
        const entry =
            setting && typeof setting === "object"
                ? (setting as Record<string, unknown>)
                : undefined;
        if (!entry || typeof entry.id !== "string" || typeof entry.type !== "string") {
            throw new Error(
                `Widget config for "${widgetId}": every setting needs string "id" and "type"`,
            );
        }
    }
    return settings as SettingMetadata[];
}

function readSize(
    widgetId: string,
    size: unknown,
): WidgetSizeConfig | undefined {
    if (size === undefined) return undefined;
    if (typeof size !== "object" || size === null) {
        throw new Error(
            `Widget config for "${widgetId}": "size" must be an object`,
        );
    }
    return size as WidgetSizeConfig;
}
