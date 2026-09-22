import { describe, expect, it } from "vitest";

import { Bbox } from "@core/lib/geo";
import type { LayerAdapter } from "./render";
import type {
    PointCloudDataAdapter,
    PointCloudData,
} from "./point-cloud";
import {
    toPointCloudDataAdapter,
    findPointCloudDataAdapter,
} from "./point-cloud";
import type { ProtocolRegistry } from "./protocol";

const BASE_ADAPTER: LayerAdapter = {
    nativeLayerOrdering: false,
    addToMap: () => {},
    removeFromMap: () => {},
    updateVisibility: () => {},
    updateConfig: () => {},
};

const CLOUD_DATA: PointCloudData = {
    positions: new Float32Array(3),
    coordinateOrigin: [0, 0, 0],
    pointCount: 1,
    bounds: Bbox.fromCorners({
        minX: 0,
        minY: 0,
        minZ: 0,
        maxX: 0,
        maxY: 0,
        maxZ: 0,
    }),
};

const CLOUD_ADAPTER = {
    ...BASE_ADAPTER,
    getLoadedData: (): PointCloudData | undefined => CLOUD_DATA,
    getAllLoadedData: (): PointCloudData[] => [CLOUD_DATA],
};

describe("toPointCloudDataAdapter", () => {
    it("returns null for a missing adapter", () => {
        expect(toPointCloudDataAdapter(undefined)).toBeNull();
    });

    it("returns null when the adapter serves no clouds", () => {
        expect(toPointCloudDataAdapter(BASE_ADAPTER)).toBeNull();
    });

    it("narrows a cloud-serving adapter to the data port", () => {
        const port: PointCloudDataAdapter | null = toPointCloudDataAdapter(
            CLOUD_ADAPTER,
        );
        expect(port).not.toBeNull();
        expect(port?.getLoadedData("layer-1")).toBe(CLOUD_DATA);
        expect(port?.getAllLoadedData()).toEqual([CLOUD_DATA]);
    });
});

describe("findPointCloudDataAdapter", () => {
    const registryWith = (...protocols: unknown[]): ProtocolRegistry =>
        ({ getAll: () => protocols }) as unknown as ProtocolRegistry;

    const cloudProtocol = (loadedLayer?: string): unknown => ({
        getLayerAdapter: () =>
            loadedLayer
                ? {
                      ...CLOUD_ADAPTER,
                      getLoadedData: (id: string) =>
                          id === loadedLayer ? CLOUD_DATA : undefined,
                  }
                : CLOUD_ADAPTER,
    });
    const plainProtocol = (): unknown => ({
        getLayerAdapter: () => BASE_ADAPTER,
    });

    it("skips non-cloud protocols and finds the cloud adapter (ADR-0012)", () => {
        const found = findPointCloudDataAdapter(
            registryWith(plainProtocol(), cloudProtocol(), plainProtocol()),
        );
        expect(found).not.toBeNull();
    });

    it("with a layerId, only an adapter holding that layer matches", () => {
        const registry = registryWith(cloudProtocol("cloud-a"));
        expect(findPointCloudDataAdapter(registry, "cloud-a")).not.toBeNull();
        expect(findPointCloudDataAdapter(registry, "cloud-b")).toBeNull();
    });

    it("returns null when no protocol serves clouds", () => {
        expect(
            findPointCloudDataAdapter(registryWith(plainProtocol())),
        ).toBeNull();
    });
});
