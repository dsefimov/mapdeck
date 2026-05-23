/**
 * WMS grouper — groups consecutive WMS layers into batch render units.
 *
 * Pure functions — no MobX, no MapLibre dependencies.
 * Operates on the same snapshot format as buildDesiredRenderUnits.
 */

import type {
    WmsGroupConfig,
    WmsGroupKey,
    RasterLayerConfig,
    RenderUnit,
    LayerAdapter,
    SnapshotItem,
} from "@core/framework/types";
import { LayerRoles } from "@core/framework/types";
import { parseWmsUrl, buildWmsTileUrl, getWmsLayerName } from "./url";
import { generateGroupId, keysMatch, getWmsGroupKey } from "./grouping";
import type { LayerAdapterFactory } from "@core/domain/adapters";

/**
 * Input item shape — matches the snapshot format from LayerTreeStore.
 */
interface WmsGroupInput {
    id: string;
    config: RasterLayerConfig;
}

const WMS_TYPE = "wms" as const;

/**
 * Group consecutive WMS layers into batch render units.
 *
 * Rules:
 * - Only processes items where config.type === "wms"
 * - Groups consecutive items with matching WmsGroupKey
 * - Max `maxPerGroup` items per group (default: 10)
 * - Returns groups in the same order as input items
 */
export function groupVisibleWmsNodes(
    items: WmsGroupInput[],
    maxPerGroup: number = 10,
): WmsGroupConfig[] {
    if (items.length === 0) return [];

    const groups: WmsGroupConfig[] = [];
    let currentGroup: WmsGroupInput[] = [];
    let currentKey: WmsGroupKey | null = null;

    for (const item of items) {
        const key = getWmsGroupKey(item.config);

        if (shouldFlush(currentGroup, currentKey, key, maxPerGroup)) {
            groups.push(buildGroup(currentGroup, currentKey!));
            currentGroup = [];
            currentKey = null;
        }

        if (key) {
            currentKey = key;
            currentGroup.push(item);
        }
    }

    if (currentGroup.length > 0 && currentKey) {
        groups.push(buildGroup(currentGroup, currentKey));
    }

    return groups;
}

function shouldFlush(
    group: WmsGroupInput[],
    currentKey: WmsGroupKey | null,
    nextKey: WmsGroupKey | null,
    maxPerGroup: number,
): boolean {
    if (group.length === 0) return false;
    if (!nextKey) return true;
    if (!currentKey || !keysMatch(currentKey, nextKey)) return true;
    return group.length >= maxPerGroup;
}

/**
 * Apply WMS grouping to a result map of render units.
 * Removes individual WMS units and replaces them with group units.
 */
export function applyWmsGrouping(
    snapshot: SnapshotItem[],
    adapterFactory: LayerAdapterFactory,
    result: Map<string, RenderUnit>,
): void {
    const wmsInputs = collectWmsInputs(snapshot);
    if (wmsInputs.length === 0) return;

    const groups = groupVisibleWmsNodes(wmsInputs);
    const rasterAdapter = adapterFactory.get(LayerRoles.RASTER);

    for (const input of wmsInputs) {
        result.delete(input.id);
    }

    for (const group of groups) {
        const groupUnit = buildGroupRenderUnit(group, wmsInputs, rasterAdapter);
        result.set(group.groupId, groupUnit);
    }
}

function collectWmsInputs(snapshot: SnapshotItem[]): WmsGroupInput[] {
    const inputs: WmsGroupInput[] = [];
    for (const item of snapshot) {
        if (!item.visible || !item.config) continue;
        if (
            item.config.role === LayerRoles.RASTER &&
            (item.config as RasterLayerConfig).type === WMS_TYPE
        ) {
            inputs.push({
                id: item.id,
                config: item.config as RasterLayerConfig,
            });
        }
    }
    return inputs;
}

function buildGroupRenderUnit(
    group: WmsGroupConfig,
    wmsInputs: WmsGroupInput[],
    rasterAdapter: LayerAdapter,
): RenderUnit {
    // WMS draws layers bottom-to-top: first LAYERS entry = bottom.
    // Our tree order is top-to-bottom, so reverse for correct z-order.
    const reversedNodeIds = [...group.nodeIds].reverse();
    const layerNames: string[] = [];
    const styleNames: string[] = [];

    for (const nid of reversedNodeIds) {
        const input = wmsInputs.find((i) => i.id === nid);
        if (!input) continue;
        layerNames.push(getWmsLayerName(input.config.url, input.config.layers));
        styleNames.push(parseWmsUrl(input.config.url).styles);
    }

    const tileUrl = buildWmsTileUrl(group.baseUrl, layerNames.join(","), {
        version: group.version,
        format: group.format,
        styles: styleNames.join(","),
    });

    const firstInput = wmsInputs.find((i) => i.id === group.nodeIds[0]);
    const groupConfig: RasterLayerConfig = firstInput
        ? {
              ...firstInput.config,
              role: LayerRoles.RASTER,
              opacity: group.opacity,
          }
        : {
              role: LayerRoles.RASTER,
              type: WMS_TYPE,
              url: group.baseUrl,
              opacity: group.opacity,
          };

    return {
        id: group.groupId,
        nodeIds: group.nodeIds,
        adapter: rasterAdapter,
        config: groupConfig,
        sourceUrl: tileUrl,
    };
}

function buildGroup(items: WmsGroupInput[], key: WmsGroupKey): WmsGroupConfig {
    const nodeIds = items.map((item) => item.id);
    return {
        groupId: generateGroupId(nodeIds, key),
        nodeIds,
        baseUrl: key.baseUrl,
        format: key.format,
        version: key.version,
        opacity: key.opacity,
    };
}
