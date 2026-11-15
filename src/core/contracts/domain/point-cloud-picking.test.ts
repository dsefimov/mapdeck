import { describe, expect, it } from "vitest";
import { Bbox } from "@core/lib/geo";
import type { PointCloudData } from "@core/contracts";
import {
    getPointFromPickingInfo,
    getPointWithFallback,
    pickPointFromCloud,
    type PickingInfo,
    type PointPickingCamera,
} from "./point-cloud-picking";

const ORIGIN: [number, number, number] = [30, 60, 0];

const CHUNK_SUFFIXED_LAYER_ID = "cloud-chunk5";
/** A streaming cloud's incoming render-part deck layer id. */
const INCOMING_LAYER_ID = "cloud-incoming";

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

    it("reports the tree layer id for a pick on the incoming part", () => {
        const data = makeCloudData();
        const lookedUp: string[] = [];
        const result = getPointFromPickingInfo(
            pickingInfo(INCOMING_LAYER_ID, 1),
            (layerId) => {
                lookedUp.push(layerId);
                return layerId === INCOMING_LAYER_ID ? data : undefined;
            },
        );

        // The lookup keeps the raw part id — the index points into it.
        expect(lookedUp).toEqual([INCOMING_LAYER_ID]);
        expect(result).not.toBeNull();
        expect(result!.layerId).toBe("cloud");
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
            overlayManager: {
                pickObject: () => picked,
                pickObjects: () => [],
            },
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

describe("pickPointFromCloud — depth-aware candidates", () => {
    const EXCLUDE_PREFIX = "measure-";

    /** Identity projection: ranking runs in the raw degree space of the data. */
    const camera: PointPickingCamera = {
        cameraPosition: [30, 60, 10],
        projectPosition: (coords) => coords,
    };

    function pickAllWith(
        picked: PickingInfo[],
        getPointCloudData: (
            layerId: string,
        ) => PointCloudData | undefined = () => undefined,
    ) {
        return pickPointFromCloud({
            screenX: 10,
            screenY: 20,
            overlayManager: {
                pickObject: () => null,
                pickObjects: () => picked,
            },
            getPointCloudData,
            excludeLayerPrefix: EXCLUDE_PREFIX,
            camera,
        });
    }

    const cloudData = (layerId: string) =>
        layerId === "cloud" || layerId === INCOMING_LAYER_ID
            ? makeCloudData()
            : undefined;

    it("prefers the candidate nearest to the camera over the screen-closest one", () => {
        // Index 0 is the ground under the cursor, index 2 the wire slightly
        // off it — the wire is nearer to the camera and must win.
        const point = pickAllWith(
            [pickingInfo("cloud", 0), pickingInfo("cloud", 2)],
            cloudData,
        );

        expect(point).toMatchObject({
            lng: 34,
            lat: 65,
            z: 6,
            layerId: "cloud",
            pointIndex: 2,
        });
    });

    it("keeps the first candidate on a tie", () => {
        const point = pickAllWith(
            [pickingInfo("cloud", 0), pickingInfo("cloud", 0)],
            cloudData,
        );

        expect(point).toMatchObject({ pointIndex: 0 });
    });

    it("ranks by the buffer position, not the picked info coordinate", () => {
        const point = pickAllWith(
            [
                pickingInfo("cloud", 1, [999, 999, 999]),
                pickingInfo("cloud", 2),
            ],
            cloudData,
        );

        // Index 1 is nearer to the camera and wins with its real buffer
        // position, ignoring the bogus picked coordinate.
        expect(point).toMatchObject({ lng: 31, lat: 62, z: 3, pointIndex: 1 });
    });

    it("skips excluded, unknown and out-of-range candidates", () => {
        const point = pickAllWith(
            [
                pickingInfo(`${EXCLUDE_PREFIX}helper`, 0),
                pickingInfo("cloud", 3),
                pickingInfo("unknown", 0),
                pickingInfo("cloud", 1),
            ],
            cloudData,
        );

        expect(point).toMatchObject({ pointIndex: 1 });
    });

    it("reports the tree layer id for a candidate on the incoming part", () => {
        const point = pickAllWith(
            [pickingInfo(INCOMING_LAYER_ID, 2), pickingInfo("cloud", 0)],
            cloudData,
        );

        expect(point).toMatchObject({ layerId: "cloud", pointIndex: 2 });
    });

    it("returns null when no candidate survives", () => {
        expect(
            pickAllWith([pickingInfo(`${EXCLUDE_PREFIX}helper`, 0)], cloudData),
        ).toBeNull();
    });

    it("returns null when the multi pick reports no hits", () => {
        expect(pickAllWith([], cloudData)).toBeNull();
    });

    it("discovers the camera from the overlay when not passed explicitly", () => {
        const point = pickPointFromCloud({
            screenX: 10,
            screenY: 20,
            overlayManager: {
                pickObject: () => null,
                pickObjects: () => [
                    pickingInfo("cloud", 0),
                    pickingInfo("cloud", 2),
                ],
                getPickCamera: () => camera,
            },
            getPointCloudData: cloudData,
            excludeLayerPrefix: EXCLUDE_PREFIX,
        });

        expect(point).toMatchObject({ pointIndex: 2, z: 6 });
    });
});

describe("getPointWithFallback", () => {
    it("falls back to the event lngLat at z=0 when the cloud pick misses", () => {
        const point = getPointWithFallback({
            screenX: 10,
            screenY: 20,
            eventLngLat: { lng: 30.1, lat: 60.2 },
            overlayManager: {
                pickObject: () => null,
                pickObjects: () => [],
            },
            getPointCloudData: () => undefined,
            excludeLayerPrefix: "measure-",
            camera: {
                cameraPosition: [30, 60, 10],
                projectPosition: (coords) => coords,
            },
        });

        expect(point).toEqual({ lng: 30.1, lat: 60.2, z: 0 });
    });
});
