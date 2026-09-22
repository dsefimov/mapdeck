import type { LayerStyle } from "@core/contracts";

/** Immutable update: sets raster-opacity in paint. */
export function setRasterOpacity(
    style: LayerStyle,
    opacity: number,
): LayerStyle {
    return { ...style, paint: { ...style.paint, "raster-opacity": opacity } };
}

/** Immutable update: sets circle-radius in paint. */
export function setPointSize(style: LayerStyle, pointSize: number): LayerStyle {
    return { ...style, paint: { ...style.paint, "circle-radius": pointSize } };
}

/** Immutable update: sets colorScheme in metadata. */
export function setColorScheme(
    style: LayerStyle,
    colorScheme: string,
): LayerStyle {
    return { ...style, metadata: { ...style.metadata, colorScheme } };
}

/**
 * Immutable update: sets one opacity across every vector paint channel —
 * fill, line and circle — so a style change never leaves the channels
 * disagreeing. Other paint properties pass through untouched.
 */
export function setUniformVectorOpacity(
    style: LayerStyle,
    opacity: number,
): LayerStyle {
    return {
        ...style,
        paint: {
            ...style.paint,
            "fill-opacity": opacity,
            "line-opacity": opacity,
            "circle-opacity": opacity,
        },
    };
}
