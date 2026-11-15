import { useEffect, useState } from "react";
import {
    getMeasureColors,
    subscribeTheme,
    type MeasureColors,
} from "./themeColors";

/**
 * The current measure colors, re-resolved when the theme changes. UI wiring
 * only — measure tools pass the result into `renderTechLayers` instead of a
 * store subscribing to the theme itself.
 */
export function useMeasureColors(): MeasureColors {
    const [colors, setColors] = useState<MeasureColors>(getMeasureColors);

    useEffect(() => subscribeTheme(() => setColors(getMeasureColors())), []);

    return colors;
}
