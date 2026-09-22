import type { AttributeLayerInfo } from "./index";

/** Layers split by their group title: named groups plus the ungrouped rest. */
export interface GroupedLayers {
    groups: Map<string, AttributeLayerInfo[]>;
    ungrouped: AttributeLayerInfo[];
}

/** Split layers into groups keyed by group title; layers without one go to `ungrouped`. */
export function groupLayersByTitle(
    layers: readonly AttributeLayerInfo[],
): GroupedLayers {
    const groups = new Map<string, AttributeLayerInfo[]>();
    const ungrouped: AttributeLayerInfo[] = [];

    for (const layer of layers) {
        if (layer.groupTitle) {
            const list = groups.get(layer.groupTitle);
            if (list) {
                list.push(layer);
            } else {
                groups.set(layer.groupTitle, [layer]);
            }
        } else {
            ungrouped.push(layer);
        }
    }

    return { groups, ungrouped };
}
