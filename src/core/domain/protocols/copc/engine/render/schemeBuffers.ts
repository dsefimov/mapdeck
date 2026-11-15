import { ColorScheme } from "@core/contracts";
import type { CachedNode } from "../../types";

/**
 * Single mapping between a color scheme and its slot on a cached node —
 * used by the render pool to read buffers and by the recolor path to fill
 * them in lazily.
 */
export function pickNodeColors(
    node: CachedNode,
    scheme: ColorScheme,
): Uint8Array | undefined {
    switch (scheme) {
        case ColorScheme.ELEVATION:
            return node.colorsElevation;
        case ColorScheme.INTENSITY:
            return node.colorsIntensity;
        case ColorScheme.CLASSIFICATION:
            return node.colorsClassification;
        case ColorScheme.RGB:
        default:
            return node.colorsRgb;
    }
}

/** Writes a derived buffer into the node slot for `scheme` (no-op for RGB). */
export function setNodeColors(
    node: CachedNode,
    scheme: ColorScheme,
    colors: Uint8Array,
): void {
    switch (scheme) {
        case ColorScheme.ELEVATION:
            node.colorsElevation = colors;
            break;
        case ColorScheme.INTENSITY:
            node.colorsIntensity = colors;
            break;
        case ColorScheme.CLASSIFICATION:
            node.colorsClassification = colors;
            break;
        case ColorScheme.RGB:
        default:
            break;
    }
}
