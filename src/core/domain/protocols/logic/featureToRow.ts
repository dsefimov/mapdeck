import type { FeatureRow } from "@core/contracts";
import type { GeoJSONGeometry } from "@core/lib/geo";
import { bboxFromGeometry } from "@core/lib/geo";

/** Flatten one GeoJSON-ish feature into an attribute-table row. */
export function featureToRow(
    geometry: GeoJSONGeometry | null | undefined,
    properties: Record<string, unknown> | null | undefined,
): FeatureRow {
    const row: FeatureRow = { ...(properties ?? {}) };

    const bbox = bboxFromGeometry(geometry ?? null);
    if (bbox) {
        row._bbox = bbox;
    }
    return row;
}
