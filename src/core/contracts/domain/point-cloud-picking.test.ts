import { describe, expect, it } from "vitest";
import { Bbox } from "@core/lib/geo";
import type { PointCloudData } from "@core/contracts";
import {
    getPointFromPickingInfo,
    pickPointFromCloud,
    type PickingInfo,
} from "./point-cloud-picking";

const ORIGIN: [number, number, number] = [30, 60, 0];

const CHUNK_SUFFIXED_LAYER_ID = "cloud-chunk5";

function makeCloudData(): PointCloudData {
    return {
        positions: new Float32Array([0, 0, 0, 1, 2, 3, 4, 5, 6]),
        coordinateOrigin: ORIGIN,
        colors: new Uint8Array([
            10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255,
        ]),
        intensities: new Float32Array([0.5, 0.25, 0.75]),
        classifications: new Uint8Array([2, 5, 6]),
        pointCount: 3,
        bounds: Bbox.fromCorners({
            minX: 30,
            minY: 60,
            minZ: 0,
            maxX: 31,
            maxY: 62,
            maxZ: 6,
        }),
    };
}

function pickingInfo(
    layerId: string,
    index: number,
    coordinate?: [number, number, number],
): PickingInfo {
    return {
        layer: { id: layerId },
        index,
        coordinate,
    };
}

describe("getPointFromPickingInfo", () => {
    it("prefers pickingInfo.coordinate over the positions array", () => {
        const data = makeCloudData();
        const result = getPointFromPickingInfo(
            pickingInfo("cloud", 2, [30.5, 60.5, 12]),
            (layerId) => (layerId === "cloud" ? data : undefined),
        );

        expect(result).not.toBeNull();
        expect(result!.lng).toBe(30.5);
        expect(result!.lat).toBe(60.5);
        expect(result!.z).toBe(12);
        expect(result!.pointIndex).toBe(2);
        expect(result!.layerId).toBe("cloud");
    });

    it("falls back to positions array offsets from the coordinate origin", () => {
        const data = makeCloudData();
        const result = getPointFromPickingInfo(
            pickingInfo("cloud", 1),
            (layerId) => (layerId === "cloud" ? data : undefined),
        );

        expect(result).not.toBeNull();
        expect(result!.lng).toBe(31);
        expect(result!.lat).toBe(62);
        expect(result!.z).toBe(3);
    });

    it("extracts color, intensity and classification at the picked index", () => {
        const data = makeCloudData();
        const result = getPointFromPickingInfo(
            pickingInfo("cloud", 0),
            (layerId) => (layerId === "cloud" ? data : undefined),
        );

        expect(result!.attributes).toEqual({
            color: [10, 20, 30],
            intensity: 0.5,
            classification: 2,
        });
    });

    it("returns null when the index is out of range", () => {
        const data = makeCloudData();
        const result = getPointFromPickingInfo(
            pickingInfo("cloud", data.pointCount),
            (layerId) => (layerId === "cloud" ? data : undefined),
        );

        expect(result).toBeNull();
    });

    it("returns null when the layer has no loaded data", () => {
        const result = getPointFromPickingInfo(
            pickingInfo("unknown", 0),
            () => undefined,
        );

        expect(result).toBeNull();
    });

    it("returns null without a layer id or index", () => {
        expect(
            getPointFromPickingInfo({ layer: null, index: 0 }, () => undefined),
        ).toBeNull();
        expect(
            getPointFromPickingInfo(
                { layer: { id: "cloud" }, index: null },
                () => undefined,
            ),
        ).toBeNull();
    });

    it("treats a layer id ending in -chunkN as a plain layer id", () => {
        const data = makeCloudData();
        const result = getPointFromPickingInfo(
            pickingInfo(CHUNK_SUFFIXED_LAYER_ID, 1),
            (layerId) =>
                layerId === CHUNK_SUFFIXED_LAYER_ID ? data : undefined,
        );

        expect(result).not.toBeNull();
        expect(result!.layerId).toBe(CHUNK_SUFFIXED_LAYER_ID);
        expect(result!.pointIndex).toBe(1);
    });
});

describe("pickPointFromCloud", () => {
    const EXCLUDE_PREFIX = "measure-";

    function pickWith(
        picked: PickingInfo | null,
        getPointCloudData: (
            layerId: string,
        ) => PointCloudData | undefined = () => undefined,
    ) {
        return pickPointFromCloud({
            screenX: 10,
            screenY: 20,
            overlayManager: { pickObject: () => picked },
            getPointCloudData,
            excludeLayerPrefix: EXCLUDE_PREFIX,
        });
    }

    it("returns the picked point narrowed of its attributes", () => {
        const data = makeCloudData();
        const point = pickWith(pickingInfo("cloud", 2, [30.5, 60.5, 12]), (
            layerId,
        ) => (layerId === "cloud" ? data : undefined));

        expect(point).toMatchObject({
            lng: 30.5,
            lat: 60.5,
            z: 12,
            layerId: "cloud",
            pointIndex: 2,
            coordinateOrigin: ORIGIN,
        });
        expect(point).not.toHaveProperty("attributes");
    });

    it("returns null when the overlay reports no hit", () => {
        expect(pickWith(null)).toBeNull();
    });

    it("returns null for a layer excluded by prefix", () => {
        expect(pickWith(pickingInfo(`${EXCLUDE_PREFIX}helper`, 0))).toBeNull();
    });

    it("returns null without a point index", () => {
        expect(
            pickWith({ layer: { id: "cloud" }, index: null }),
        ).toBeNull();
    });

    it("returns null when the picked layer has no loaded data", () => {
        expect(pickWith(pickingInfo("unknown", 0))).toBeNull();
    });
});
