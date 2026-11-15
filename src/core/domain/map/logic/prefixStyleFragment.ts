import type {
    LayerSpecification,
    SourceSpecification,
    StyleSpecification,
} from "maplibre-gl";

/** A style fragment made owner-prefixed and page-absolute — ready to apply. */
export interface PrefixedFragment {
    sources: Record<string, SourceSpecification>;
    layers: LayerSpecification[];
    /** Absolute sprite URL, present only when the fragment carries one. */
    sprite?: string;
}

/**
 * Clone a style fragment under an owner prefix: source and layer ids get
 * the prefix, layer source references remap to the prefixed source id,
 * and a sprite path resolves against the page origin — the document
 * origin is the only base that exists for page-served sprites. Pure: the
 * store only applies the result to the map.
 */
export function prefixStyleFragment(
    style: Partial<StyleSpecification>,
    prefix: string,
    baseOrigin: string,
): PrefixedFragment {
    const sources: Record<string, SourceSpecification> = {};
    for (const [srcId, srcSpec] of Object.entries(style.sources ?? {})) {
        sources[prefix + srcId] = srcSpec;
    }

    const layers = (style.layers ?? []).map((layerSpec) => {
        const spec = { ...layerSpec } as Record<string, unknown>;
        spec.id = prefix + layerSpec.id;
        if (typeof spec.source === "string") {
            spec.source = prefix + spec.source;
        }
        return spec as LayerSpecification;
    });

    const sprite = absoluteSprite(style.sprite, baseOrigin);
    return sprite !== undefined
        ? { sources, layers, sprite }
        : { sources, layers };
}

function absoluteSprite(
    sprite: StyleSpecification["sprite"],
    baseOrigin: string,
): string | undefined {
    const url = typeof sprite === "string" ? sprite : sprite?.[0]?.url;
    if (!url) return undefined;
    return new URL(url, baseOrigin).href;
}
