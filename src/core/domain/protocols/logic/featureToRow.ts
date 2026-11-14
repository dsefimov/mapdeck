import type { FeatureRow } from "@core/contracts";
import { bboxFromGeometry } from "@core/lib/geo";

/**
 * Flatten one GeoJSON-ish feature into an attribute-table row. The
 * GeoJSON feature-level id survives as `_featureId` — the identity map
 * picks and the selection key convention read (ADR-0022).
 */
export function featureToRow(
    geometry: unknown,
    properties: Record<string, unknown> | null | undefined,
    featureId?: string | number | null,
): FeatureRow {
    const row: FeatureRow = { ...(properties ?? {}) };

    if (featureId !== undefined && featureId !== null) {
        row._featureId = featureId;
    }

    const bbox = bboxFromGeometry(geometry ?? null);
    if (bbox) {
        row._bbox = bbox;
    }
    return row;
}
