import type { BaseMapConfig, BasemapStatus } from "@core/contracts";

/**
 * The initial-basemap preference policy: the active config is probed
 * first, then the rest in registration order; the first healthy one
 * wins. When nothing is healthy the active config stays (a map with a
 * known basemap beats a roulette), and without an active one the first
 * available is the fallback.
 */
export function pickInitialBasemap(
    active: BaseMapConfig | undefined,
    available: readonly BaseMapConfig[],
    statusOf: (id: string) => BasemapStatus | undefined,
): BaseMapConfig | undefined {
    if (available.length === 0) return undefined;

    const candidates = active
        ? [active, ...available.filter((bm) => bm.id !== active.id)]
        : [...available];

    return (
        candidates.find((bm) => statusOf(bm.id) === "success") ??
        active ??
        available[0]
    );
}
