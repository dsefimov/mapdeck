import { describe, expect, it } from "vitest";
import { Bbox } from "@core/lib/geo";
import type { SelectionRecord } from "@core/common/selection";
import {
    SELECTION_HIGHLIGHT_LAYER_ID,
    renderSelectionHighlight,
} from "./selectionHighlightRenderer";

const geometryRecord: SelectionRecord = {
    key: "feature-1",
    footprint: {
        kind: "geometry",
        geometry: {
            type: "Polygon",
            coordinates: [
                [
                    [0, 0],
                    [1, 0],
                    [1, 1],
                    [0, 0],
                ],
            ],
        },
        bbox: new Bbox([0, 0, 1, 1]),
    },
};

const bboxRecord: SelectionRecord = {
    key: "feature-2",
    footprint: { kind: "bbox", bbox: new Bbox([5, 5, 6, 6]) },
};

const pointRecord: SelectionRecord = {
    key: "pick-3",
    footprint: {
        kind: "point",
        position: [2, 3, 10],
        bbox: new Bbox([2, 3, 2, 3]),
    },
};

type LayerProps = {
    data: Array<{ geometry: { type: string; coordinates: unknown } }>;
};

/** The single [id, layer] tuple, with the element presence asserted. */
function highlightTuple(records: readonly SelectionRecord[]) {
    const tuple = renderSelectionHighlight(records, "#ffd400").at(0);
    expect(tuple).toBeDefined();
    return tuple!;
}

describe("renderSelectionHighlight", () => {
    it("renders one feature per record with a footprint", () => {
        const [, layer] = highlightTuple([
            geometryRecord,
            bboxRecord,
            pointRecord,
        ]);

        const props = (layer as unknown as { props: LayerProps }).props;
        expect(props.data).toHaveLength(3);
    });

    it("draws a bbox footprint as its rectangle and a point as a Point", () => {
        const [, layer] = highlightTuple([bboxRecord, pointRecord]);

        const props = (layer as unknown as { props: LayerProps }).props;
        expect(props.data[0]?.geometry.type).toBe("Polygon");
        const ring = props.data[0]?.geometry.coordinates as number[][][];
        expect(ring[0]).toHaveLength(5);
        expect(props.data[1]?.geometry.type).toBe("Point");
    });

    it("drops to a null layer when nothing has a footprint", () => {
        const bare: SelectionRecord = { key: "row-0", footprint: null };

        const [id, layer] = highlightTuple([bare]);

        expect(id).toBe(SELECTION_HIGHLIGHT_LAYER_ID);
        expect(layer).toBeNull();
    });
});
