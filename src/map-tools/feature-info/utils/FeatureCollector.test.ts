import { afterEach, describe, expect, it, vi } from "vitest";
import type {
    Feature,
    FeatureProvider,
    FeatureProviderRegistry,
} from "@core/contracts";
import { logger } from "@core/lib/logger";
import { FeatureCollector, type CollectResult } from "./FeatureCollector";

function feature(layerId: string, suffix: string): Feature {
    return {
        id: `${layerId}-${suffix}`,
        layerId,
        layerName: layerId,
        attributes: {},
    } as unknown as Feature;
}

function provider(
    collect: FeatureProvider["collect"],
): FeatureProvider {
    return { collect } as unknown as FeatureProvider;
}

function registryOf(
    providers: FeatureProvider[],
): FeatureProviderRegistry {
    return {
        getAll: () => providers,
    } as unknown as FeatureProviderRegistry;
}

const PARAMS = { screenX: 1, screenY: 2 } as Parameters<
    FeatureCollector["collect"]
>[0];

afterEach(() => {
    vi.restoreAllMocks();
});

describe("FeatureCollector", () => {
    it("keeps the surviving provider's features and warns about the rejected one", async () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const boom = new Error("provider blew up");
        const collector = new FeatureCollector(
            registryOf([
                provider(() => Promise.reject(boom)),
                provider(() =>
                    Promise.resolve([feature("wms", "a")]),
                ),
            ]),
        );

        const result = await collector.collect(PARAMS, () => {});

        expect(result.loading).toBe(false);
        expect(result.groups.map((g) => g.features[0]?.id)).toEqual([
            "wms-a",
        ]);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("a provider failed"),
            boom,
        );
    });

    it("makes one group per feature, even from the same layer", async () => {
        const collector = new FeatureCollector(
            registryOf([
                provider(() =>
                    Promise.resolve([
                        feature("wms", "a"),
                        feature("wms", "b"),
                    ]),
                ),
            ]),
        );

        const result = await collector.collect(PARAMS, () => {});

        expect(result.groups).toHaveLength(2);
        expect(result.groups.map((g) => g.layerId)).toEqual(["wms", "wms"]);
    });

    it("reports loading first and the final result once settled", async () => {
        const collector = new FeatureCollector(
            registryOf([
                provider(() => Promise.resolve([feature("wms", "a")])),
            ]),
        );
        const updates: CollectResult[] = [];

        await collector.collect(PARAMS, (update) => updates.push(update));

        expect(updates.map((u) => u.loading)).toEqual([true, false]);
        expect(updates[1]?.groups).toHaveLength(1);
    });

    it("returns nothing once the click was aborted mid-collection", async () => {
        const controller = new AbortController();
        const collector = new FeatureCollector(
            registryOf([
                provider(() => Promise.resolve([feature("wms", "a")])),
            ]),
        );
        controller.abort();

        const result = await collector.collect(
            { ...PARAMS, signal: controller.signal },
            () => {},
        );

        expect(result).toEqual({ groups: [], loading: false });
    });
});
