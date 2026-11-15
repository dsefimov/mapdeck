import type {
    AssetMappingOptions,
    AssetMappingResult,
    AssetContext,
    AssetRule,
    BindingSlot,
    ProtocolBinding,
    SourceAsset,
} from "@core/contracts";

/** One asset's resolved assignment, flattened for slot selection. */
interface ProtocolMatch {
    protocolId: string;
    sourceUrl: string;
    params: Record<string, unknown>;
}

/** How the mapping reads slot fitness — a lookup into the slots table. */
export type SlotFitnessLookup = (
    protocolId: string,
    slot: BindingSlot,
) => number | undefined;

/**
 * Maps an entity's assets to node bindings through the rule chain:
 * the first rule (by priority, ties keep registration order) claims each
 * asset; among the assignments, the best slot fitness wins each slot and
 * ties keep the earlier asset; assignments whose protocol serves no slot
 * become report rows. Pure and deterministic — the rules table is
 * injected, the slots table arrives as a lookup.
 */
export function mapAssetsToSlots(
    assets: Readonly<Record<string, SourceAsset>>,
    rules: readonly AssetRule[],
    slotFitness: SlotFitnessLookup,
    options?: AssetMappingOptions,
): AssetMappingResult | null {
    const baseCtx = buildAssetContext(options);
    const matches = resolveAllAssets(assets, rules, baseCtx);
    if (matches.length === 0) return null;

    const renderer = selectSlot(matches, "renderer", slotFitness);
    const data = selectSlot(matches, "data", slotFitness);

    return assembleResult(renderer, data, matches, slotFitness);
}

function buildAssetContext(
    options?: AssetMappingOptions,
): Omit<AssetContext, "assetKey"> {
    return {
        ...(options?.properties ? { properties: options.properties } : {}),
        ...(options?.itemBbox ? { itemBbox: options.itemBbox } : {}),
        ...(options?.extensions ? { extensions: options.extensions } : {}),
    };
}

function resolveAllAssets(
    assets: Readonly<Record<string, SourceAsset>>,
    rules: readonly AssetRule[],
    baseCtx: Omit<AssetContext, "assetKey">,
): ProtocolMatch[] {
    const ordered = [...rules].sort((a, b) => a.priority - b.priority);
    const matches: ProtocolMatch[] = [];
    for (const [assetKey, asset] of Object.entries(assets)) {
        const assignment = resolveFirstMatch(ordered, asset, {
            ...baseCtx,
            assetKey,
        });
        if (!assignment) continue;
        matches.push({
            protocolId: assignment.protocolId,
            sourceUrl: assignment.sourceUrl,
            params: assignment.params ?? {},
        });
    }
    return matches;
}

function resolveFirstMatch(
    ordered: readonly AssetRule[],
    asset: SourceAsset,
    ctx: AssetContext,
) {
    for (const rule of ordered) {
        if (rule.canResolve(asset, ctx)) {
            return rule.resolve(asset, ctx);
        }
    }
    return null;
}

/** Best-fitness match for one slot; ties keep the earlier match. */
function selectSlot(
    matches: ProtocolMatch[],
    slot: BindingSlot,
    slotFitness: SlotFitnessLookup,
): ProtocolMatch | undefined {
    let best: ProtocolMatch | undefined;
    let bestFitness = -Infinity;
    for (const match of matches) {
        const fitness = slotFitness(match.protocolId, slot);
        if (fitness === undefined) continue;
        if (fitness > bestFitness) {
            best = match;
            bestFitness = fitness;
        }
    }
    return best;
}

function assembleResult(
    renderer: ProtocolMatch | undefined,
    data: ProtocolMatch | undefined,
    matches: ProtocolMatch[],
    slotFitness: SlotFitnessLookup,
): AssetMappingResult {
    const relatedObjects = matches
        .filter((m) => !hasAnySlot(m.protocolId, slotFitness))
        .map((m) => ({
            id: m.protocolId,
            title:
                typeof m.params.title === "string"
                    ? m.params.title
                    : m.protocolId,
            type: "report" as const,
            sourceUrl: m.sourceUrl,
        }));

    const result: AssetMappingResult = { relatedObjects };
    if (renderer) result.renderer = toBinding(renderer);
    if (data) result.data = toBinding(data);
    return result;
}

function hasAnySlot(
    protocolId: string,
    slotFitness: SlotFitnessLookup,
): boolean {
    return (
        slotFitness(protocolId, "renderer") !== undefined ||
        slotFitness(protocolId, "data") !== undefined
    );
}

function toBinding(match: ProtocolMatch): ProtocolBinding {
    return {
        protocolId: match.protocolId,
        sourceUrl: match.sourceUrl,
        params: match.params,
    };
}
