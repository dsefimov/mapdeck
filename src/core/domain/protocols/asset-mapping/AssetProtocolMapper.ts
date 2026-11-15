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
 * The kernel's asset→protocol mapper: holds the rule chain and the slot
 * table, maps source assets to node bindings. Not a MobX store — rules
 * and slots register during bootstrap before any observer renders, and
 * mapping runs inside fetch flows. One instance per RootStore: a
 * restart builds a fresh store and bootstrap re-registers everything.
 * The built-in protocols declare their slots at their registration
 * (`registerProtocols`), so the mapper starts empty by design.
 */
export class AssetProtocolMapper implements AssetMappingPort {
    private _rules: AssetRule[] = [];
    private _slots = new Map<string, ProtocolSlots>();

    constructor(
        seedSlots: Readonly<Record<string, ProtocolSlots>> = {},
    ) {
        for (const [protocolId, slots] of Object.entries(seedSlots)) {
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
