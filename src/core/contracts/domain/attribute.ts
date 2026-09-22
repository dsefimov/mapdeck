/**
 * Attribute fetch contract.
 * AttributeAdapter is the port between attribute data protocols and
 * protocol-specific fetch mechanics (URL building, pagination, rate limiting).
 */
import type { Bbox } from "@core/lib/geo";
import type { ProtocolBinding } from "./protocol";

/** Pagination and sorting options of one attribute fetch. */
export interface AttributeFetchRequest {
    startIndex?: number;
    maxFeatures?: number;
    sortBy?: string;
    sortDirection?: "asc" | "desc";
}

/**
 * Flattened feature row served to the attribute table.
 *
 * Underscore-prefixed keys are service-reserved: writers spread data
 * properties first, so a colliding data key can never clobber them.
 */
export interface FeatureRow {
    [key: string]: unknown;
    /** Bounding box derived from feature geometry, when available. */
    _bbox?: Bbox;
}

/** One page of flattened feature rows plus the total count. */
export interface AttributeFetchResult {
    features: FeatureRow[];
    totalFeatures: number;
}

/** Port between attribute data protocols and their fetch mechanics. */
export interface AttributeAdapter {
    fetchAttributes(
        binding: ProtocolBinding,
        request: AttributeFetchRequest,
        signal?: AbortSignal,
    ): Promise<AttributeFetchResult>;
}
