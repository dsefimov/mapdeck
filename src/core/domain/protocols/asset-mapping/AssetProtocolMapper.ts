import type {
    AssetMappingOptions,
    AssetMappingPort,
    AssetMappingResult,
    AssetRule,
    ProtocolSlots,
    SourceAsset,
} from "@core/contracts";
import type { RegisterOptions } from "@core/lib/registry";
import { applyRegistration } from "@core/lib/registry";
import { mapAssetsToSlots } from "./logic/mapAssetsToSlots";

/**
 * Slot fitness of the built-in protocols — seeded at construction so an
 * assembly that registers nothing still maps the built-in set.
 */
const DEFAULT_PROTOCOL_SLOTS: Readonly<Record<string, ProtocolSlots>> = {
    wms: { renderer: 100 },
    xyz: { renderer: 100 },
    copc: { renderer: 90 },
    "vector-tile": { renderer: 80 },
    "geojson-tiled": { renderer: 70 },
    wfs: { data: 100 },
    "ogc-features": { renderer: 70, data: 100 },
};

/**
 * The kernel's asset→protocol mapper: holds the rule chain and the slot
 * table, maps source assets to node bindings. Not a MobX store — rules
 * and slots register during bootstrap before any observer renders, and
 * mapping runs inside fetch flows. One instance per RootStore: a
 * restart builds a fresh store and bootstrap re-registers everything.
 */
export class AssetProtocolMapper implements AssetMappingPort {
    private _rules: AssetRule[] = [];
    private _slots = new Map<string, ProtocolSlots>();

    constructor(
        defaultSlots: Readonly<Record<string, ProtocolSlots>> = DEFAULT_PROTOCOL_SLOTS,
    ) {
        for (const [protocolId, slots] of Object.entries(defaultSlots)) {
            this._slots.set(protocolId, slots);
        }
    }

    registerRule(rule: AssetRule): void {
        this._rules.push(rule);
        this._rules.sort((a, b) => a.priority - b.priority);
    }

    registerSlots(
        protocolId: string,
        slots: ProtocolSlots,
        opts?: RegisterOptions,
    ): void {
        applyRegistration(this._slots, {
            label: "Protocol slots",
            key: protocolId,
            item: slots,
            opts,
        });
    }

    mapAssets(
        assets: Readonly<Record<string, SourceAsset>>,
        options?: AssetMappingOptions,
    ): AssetMappingResult | null {
        return mapAssetsToSlots(
            assets,
            this._rules,
            (protocolId, slot) => this._slots.get(protocolId)?.[slot],
            options,
        );
    }
}
