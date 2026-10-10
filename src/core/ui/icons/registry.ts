/**
 * The design system's icon names. The glyphs themselves are theme tokens
 * (`--icon-<name>` in theme.css) rendered as masks painted with
 * currentColor — artwork and color are host-overridable like any token.
 */
const iconNames = [
    "zoom",
    "raster",
    "vector",
    "point-cloud",
    "report",
    "collapsed",
    "not-collapsed",
    "layers",
    "map",
    "settings",
    "refresh",
    "ruler",
    "area",
    "volume",
    "compass",
    "info",
    "attribute-table",
    "settings-sliders",
    "file-download",
    "search",
    "angle-down",
    "close",
] as const;

export type IconName = (typeof iconNames)[number];

export { iconNames };

/**
 * Type guard for icon names arriving as plain strings — the extension
 * contracts carry `icon: string` (ui and contracts must not import each
 * other), so consumers validate before rendering.
 */
export function isIconName(value: string): value is IconName {
    return (iconNames as readonly string[]).includes(value);
}
