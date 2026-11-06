import type { FeatureRow } from "@core/contracts";
import { bboxFromGeometry } from "@core/lib/geo";

/** Flatten one GeoJSON-ish feature into an attribute-table row. */
export function featureToRow(
    geometry: unknown,
    properties: Record<string, unknown> | null | undefined,
): FeatureRow {
    const row: FeatureRow = { ...(properties ?? {}) };

    const bbox = bboxFromGeometry(geometry ?? null);
    if (bbox) {
        row._bbox = bbox;
    }
    return row;
}
