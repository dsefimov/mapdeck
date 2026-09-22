/**
 * Pure WFS URL building functions.
 * No side effects — only URL construction.
 */

import type { WfsRequestParams } from "./types";

/**
 * Detect WFS version from URL params or use default.
 */
export function detectVersion(params: WfsRequestParams): string {
    return params.version ?? "2.0.0";
}

/**
 * Build WFS GetFeature URL for the given version.
 */
export function buildWfsUrl(params: WfsRequestParams): string {
    const {
        url,
        maxFeatures,
        startIndex,
        cqlFilter,
        srsName,
        sortBy,
        sortDirection,
        extraParams,
    } = params;
    const version = detectVersion(params);

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error(
            `Invalid WFS endpoint URL: "${url}". Ensure the URL is absolute and properly encoded.`,
        );
    }
    const qp = parsedUrl.searchParams;

    // Core WFS parameters
    qp.set("SERVICE", "WFS");
    qp.set("VERSION", version);
    qp.set("REQUEST", "GetFeature");
    qp.set("OUTPUTFORMAT", "application/json");

    // Version-specific pagination
    setPaginationParams(qp, version, startIndex, maxFeatures);

    // Optional parameters
    if (srsName) {
        qp.set("SRSNAME", srsName);
    }
    if (cqlFilter) {
        qp.set("CQL_FILTER", cqlFilter);
    }
    if (sortBy) {
        setSortParams(qp, sortBy, sortDirection);
    }
    if (extraParams) {
        for (const [key, value] of Object.entries(extraParams)) {
            qp.set(key, value);
        }
    }

    return parsedUrl.toString();
}

/**
 * Set pagination parameters based on WFS version.
 */
export function setPaginationParams(
    qp: URLSearchParams,
    version: string,
    startIndex: number | undefined,
    maxFeatures: number | undefined,
): void {
    if (version.startsWith("2.")) {
        if (startIndex !== undefined) {
            qp.set("STARTINDEX", String(startIndex));
        }
        if (maxFeatures !== undefined) {
            qp.set("COUNT", String(maxFeatures));
        }
    } else {
        // STARTINDEX is zero-based in every OGC generation (1.1.0 and 2.0
        // alike) — no offset here.
        if (startIndex !== undefined) {
            qp.set("STARTINDEX", String(startIndex));
        }
        if (maxFeatures !== undefined) {
            qp.set("MAXFEATURES", String(maxFeatures));
        }
    }
}

/**
 * Set sort parameters for WFS request.
 */
export function setSortParams(
    qp: URLSearchParams,
    sortBy: string,
    sortDirection: "asc" | "desc" | undefined,
): void {
    const sortValue = sortDirection === "desc" ? `${sortBy} D` : `${sortBy} A`;
    qp.set("SORTBY", sortValue);
}
