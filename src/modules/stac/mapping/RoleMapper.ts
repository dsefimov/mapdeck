import type {
    ProtocolBinding,
    RelatedObject,
} from "@core/contracts";
import type { STACAsset } from "../types";
import type { RoleResolverRegistry } from "../roles/RoleResolverRegistry";
import type { ResolveContext } from "../roles/IRoleResolver";
import { slotFitness } from "./protocolSlots";

interface ProtocolMatch {
    protocolId: string;
    sourceUrl: string;
    params: Record<string, unknown>;
}

/** Unified result of mapping STAC assets to the protocol-based layer system. */
export interface ProtocolMappingResult {
    renderer?: ProtocolBinding;
    data?: ProtocolBinding;
    relatedObjects: RelatedObject[];
}

/**
 * Resolve STAC item assets to protocol bindings. Each slot is resolved
 * independently: among the assignments whose protocol offers it
 * (PROTOCOL_SLOT_FITNESS), the best fitness wins, ties keep the earlier
 * asset. The same protocol may take both slots. Protocols without a table
 * entry become report rows. Returns null when no asset matched a resolver.
 */
export function mapAssetsToProtocols(
    assets: Readonly<Record<string, STACAsset>>,
    resolverRegistry: RoleResolverRegistry,
    options?: {
        properties?: Record<string, unknown>;
        itemBbox?: readonly number[];
        stac_extensions?: readonly string[];
    },
): ProtocolMappingResult | null {
    const baseCtx = buildResolveContext(options);
    const matches = resolveAllAssets(assets, resolverRegistry, baseCtx);
    if (matches.length === 0) return null;

    const renderer = selectSlot(matches, "renderer");
    const data = selectSlot(matches, "data");

    return assembleResult(renderer, data, matches);
}

function buildResolveContext(options?: {
    properties?: Record<string, unknown>;
    itemBbox?: readonly number[];
    stac_extensions?: readonly string[];
}): ResolveContext {
    return {
        assetKey: "",
        ...(options?.properties ? { properties: options.properties } : {}),
        ...(options?.itemBbox ? { itemBbox: options.itemBbox } : {}),
        ...(options?.stac_extensions
            ? { stac_extensions: options.stac_extensions }
            : {}),
    };
}

function resolveAllAssets(
    assets: Readonly<Record<string, STACAsset>>,
    resolverRegistry: RoleResolverRegistry,
    baseCtx: ResolveContext,
): ProtocolMatch[] {
    const matches: ProtocolMatch[] = [];
    for (const [assetKey, asset] of Object.entries(assets)) {
        const assignment = resolverRegistry.resolve(asset, {
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

/** Best-fitness match for one slot; ties keep the earlier match. */
function selectSlot(
    matches: ProtocolMatch[],
    slot: "renderer" | "data",
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
): ProtocolMappingResult {
    const relatedObjects = matches
        .filter((m) => !hasAnySlot(m.protocolId))
        .map((m) => ({
            id: m.protocolId,
            title:
                typeof m.params.title === "string"
                    ? m.params.title
                    : m.protocolId,
            type: "report" as const,
            sourceUrl: m.sourceUrl,
        }));

    const result: ProtocolMappingResult = { relatedObjects };
    if (renderer) result.renderer = toBinding(renderer);
    if (data) result.data = toBinding(data);
    return result;
}

function hasAnySlot(protocolId: string): boolean {
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
