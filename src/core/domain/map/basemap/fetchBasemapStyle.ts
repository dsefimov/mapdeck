import type { BaseMapConfig } from "@core/contracts";
import { boundedFetch } from "@core/lib/async";

/**
 * Style-Url fetch timeout — a single source for the registration default,
 * kept next to the helper that consumes it (the probe timeout follows the
 * same precedent in `checkBasemapHealth`).
 */
export const STYLE_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch the maplibre style JSON a config's `styleUrl` points to. A failed
 * fetch resolves to `undefined` — the config still registers, and the
 * health probe reports it unavailable; an unreachable style is a deployment
 * fact to display, not a registration error.
 */
export async function fetchBasemapStyle(
    styleUrl: string,
): Promise<NonNullable<BaseMapConfig["style"]> | undefined> {
    try {
        const response = await boundedFetch(styleUrl, {
            timeoutMs: STYLE_FETCH_TIMEOUT_MS,
        });
        if (!response.ok) return undefined;
        return (await response.json()) as NonNullable<
            BaseMapConfig["style"]
        >;
    } catch {
        return undefined;
    }
}
