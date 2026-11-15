import type { AttributeLayerInfo } from "./index";

export interface GroupedLayers {
    groups: Map<string, AttributeLayerInfo[]>;
    ungrouped: AttributeLayerInfo[];
}

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
