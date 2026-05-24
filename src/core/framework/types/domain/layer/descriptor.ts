/**
 * Unified render descriptor — single source of truth for map rendering.
 * Replaces the layerConfig + sourceUrl pair that was split across
 * DisplayRole, SnapshotItem, and RenderUnit.
 */
import type { LayerRole } from "./role";
import type { LayerConfigFor } from "./config";

export interface RenderDescriptor<TRole extends LayerRole = LayerRole> {
    readonly role: TRole;
    readonly sourceUrl: string;
    readonly config: LayerConfigFor<TRole>;
}

export function makeRenderDescriptor<TRole extends LayerRole>(
    role: TRole,
    sourceUrl: string,
    config: LayerConfigFor<TRole>,
): RenderDescriptor<TRole> {
    return { role, sourceUrl, config };
}

/** Immutable config update — returns new descriptor, does not mutate. */
export function updateDescriptorConfig<TRole extends LayerRole>(
    descriptor: RenderDescriptor<TRole>,
    updates: Partial<LayerConfigFor<TRole>>,
): RenderDescriptor<TRole> {
    return { ...descriptor, config: { ...descriptor.config, ...updates } };
}

export function isDescriptorRole<TRole extends LayerRole>(
    descriptor: RenderDescriptor,
    role: TRole,
): descriptor is RenderDescriptor<TRole> {
    return descriptor.role === role;
}
