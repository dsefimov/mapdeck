/**
 * The asset→protocol mapping contracts: how a source's tagged assets
 * become protocol bindings on tree nodes. Declared in contracts because
 * two sides meet here — modules register rules and slots through the
 * extension context, and source adapters consume the mapping at fetch
 * time. The types are protocol-neutral: an asset is a tagged resource at
 * a URL, nothing more; source-specific vocabulary stays with the source.
 */

import type { BindingSlot } from "./tree";
import type { ProtocolBinding, RelatedObject } from "./protocol";
import type { RegisterOptions } from "@core/lib/registry";

/**
 * A source asset: a tagged resource at a URL. The open index signature
 * carries source-specific extension fields — rules read them through
 * their own knowledge of the source, the kernel never does.
 */
export interface SourceAsset {
    readonly href: string;
    readonly title?: string;
    readonly type?: string;
    readonly roles?: readonly string[];
    readonly [key: string]: unknown;
}

/** The per-asset slice of the mapping call: which asset, where it lives. */
export interface AssetContext {
    /** Key of the asset inside its owner's asset record. */
    readonly assetKey: string;
    /** Properties of the owning entity, when the source provides them. */
    readonly properties?: Record<string, unknown>;
    /** Bbox of the owning entity, when the source provides it. */
    readonly itemBbox?: readonly number[];
    /** Extension identifiers the owning entity declares. */
    readonly extensions?: readonly string[];
}

/** Options of a whole-record mapping call — the entity-level context. */
export interface AssetMappingOptions {
    /** Properties of the owning entity, when the source provides them. */
    readonly properties?: Record<string, unknown>;
    /** Bbox of the owning entity, when the source provides it. */
    readonly itemBbox?: readonly number[];
    /** Extension identifiers the owning entity declares. */
    readonly extensions?: readonly string[];
}

/**
 * A rule's resolution of one asset: which protocol takes it, at which
 * URL, with which parameters — the input of slot selection, not yet a
 * node binding.
 */
export interface ProtocolAssignment {
    protocolId: string;
    sourceUrl: string;
    params?: Record<string, unknown>;
    style?: Record<string, unknown>;
}

/**
 * One matching rule: claims assets it can resolve and turns them into
 * assignments. `priority` orders the chain — lower numbers run first;
 * the first rule whose `canResolve` returns true wins the asset.
 */
export interface AssetRule {
    readonly priority: number;
    canResolve(asset: SourceAsset, ctx: AssetContext): boolean;
    resolve(asset: SourceAsset, ctx: AssetContext): ProtocolAssignment;
}

/**
 * Which slots a protocol can serve and how well: fitness per
 * {@link BindingSlot}; a slot without an entry is not served. Larger
 * numbers win a contested slot.
 */
export type ProtocolSlots = Partial<Record<BindingSlot, number>>;

/** The outcome of mapping one entity's assets: node bindings plus reports. */
export interface AssetMappingResult {
    renderer?: ProtocolBinding;
    data?: ProtocolBinding;
    relatedObjects: RelatedObject[];
}

/**
 * The declared extension point of asset mapping: modules register
 * matching rules and protocol slots; source adapters map assets through
 * the same instance. One port, both directions — the only reader of
 * `mapAssets` today is a module's own source adapter, so a read/write
 * split would have a single-consumer read side.
 */
export interface AssetMappingPort {
    /** Adds a rule to the chain; ordered by priority, insertion breaks ties. */
    registerRule(rule: AssetRule): void;
    /**
     * Declares a protocol's slot fitness. Duplicates throw unless
     * `opts.override` (the common registration policy).
     */
    registerSlots(
        protocolId: string,
        slots: ProtocolSlots,
        opts?: RegisterOptions,
    ): void;
    /**
     * Maps an entity's assets to node bindings: among the assignments a
     * rule produced for each asset, the best slot fitness wins each slot;
     * assignments whose protocol serves no slot become report rows.
     * `null` when no rule claimed any asset.
     */
    mapAssets(
        assets: Readonly<Record<string, SourceAsset>>,
        options?: AssetMappingOptions,
    ): AssetMappingResult | null;
}
