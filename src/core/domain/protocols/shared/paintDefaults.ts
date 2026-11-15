/**
 * Paint defaults shared by the maplibre style specs (VectorAdapter) and the
 * deck.gl layer props (GeoJsonAdapter): the same paint keys must fall back
 * to the same values in both renderers, or one layer changes appearance
 * when it switches renderers.
 */

/** Fallback for an unspecified `line-width`. */
export const DEFAULT_LINE_WIDTH_PX = 2;

/** Fallback for an unspecified `circle-radius` / point radius. */
export const DEFAULT_POINT_RADIUS_PX = 5;

/** Fallback for an unspecified label font size. */
export const DEFAULT_LABEL_TEXT_SIZE_PX = 12;
