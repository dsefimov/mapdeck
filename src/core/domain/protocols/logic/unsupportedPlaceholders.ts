/**
 * Placeholder features for layers no feature provider can serve — the
 * generic replacement for the per-protocol hardcoding that used to live in
 * WmsFeatureProvider. Registration declares which protocols ARE served; every
 * other visible layer yields one honest "not available" feature, so adding a
 * protocol touches only its own registration line, never a sibling provider.
 */
import type {
    Feature,
    FeatureProvider,
    CollectParams,
} from "@core/contracts";

/** Creates the provider for the complement of the served protocol set. */
export function createUnsupportedPlaceholderProvider(
    servedProtocols: ReadonlySet<string>,
): FeatureProvider {
    return {
        collect(params: CollectParams): Feature[] {
            return params.visibleLayers
                .filter(
                    (node) => !servedProtocols.has(node.renderer.protocolId),
                )
                .map((node) => ({
                    id: `${node.id}_unsupported`,
                    layerId: node.id,
                    layerName: node.title,
                    attributes: {},
                    unsupported: true,
                }));
        },
    };
}
