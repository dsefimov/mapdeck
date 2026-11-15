import type { LayerStyle } from "@core/contracts";

/**
 * Merge a provided style over a protocol's default style.
 *
 * Shallow spread: provided keys win at the top level; nested objects
 * (`paint`, `layout`, `metadata`) are replaced wholesale, not deep-merged.
 * Returns the default style as-is when no style is provided.
 */
export function resolveStyle(
    defaultStyle: LayerStyle,
    style?: LayerStyle,
): LayerStyle {
    return style ? { ...defaultStyle, ...style } : defaultStyle;
}
