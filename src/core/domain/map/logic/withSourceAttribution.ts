import type { StyleSpecification } from "maplibre-gl";

/**
 * Clone a style fragment with every source carrying the config's
 * attribution override. maplibre's AttributionControl renders source
 * attributions — this is the path a BaseMapConfig.attribution value takes
 * to the visible license line. Without an override the fragment passes
 * through unchanged.
 */
export function withSourceAttribution(
    style: StyleSpecification,
    attribution: string | undefined,
): StyleSpecification {
    if (!attribution || !style.sources) return style;

    const sources = {} as StyleSpecification["sources"];
    for (const [name, source] of Object.entries(style.sources)) {
        // The style-spec union does not carry attribution uniformly, but
        // maplibre reads it on every source kind — inject through the
        // common-field shape.
        sources[name] =
            source && typeof source === "object"
                ? ({
                      ...source,
                      attribution,
                  } as unknown as StyleSpecification["sources"][string])
                : source;
    }
    return { ...style, sources };
}
