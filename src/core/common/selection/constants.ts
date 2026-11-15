/**
 * Selection vocabulary that both the map tool (the setting's owner) and
 * the map viewer's highlight (its reader) need — common ground, because
 * widgets cannot import map tools.
 */

/** The selection color setting, declared by the selection map tool. */
export const SELECTION_COLOR_SETTING_ID = "selection.color";

/** QGIS-like selection yellow; the tool registers it as the default. */
export const DEFAULT_SELECTION_COLOR = "#ffd400";
