import type { STACAsset } from "../types";

/**
 * STAC roles (best practices) indicating a document or report.
 * "metadata" is the official STAC role, "report" is a project-specific extension.
 */
const REPORT_ROLES = new Set(["report", "metadata"]);

/**
 * MIME types treated as report / document assets.
 * Extend this set as new formats are introduced.
 */
const REPORT_MIMES = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/plain",
    "text/csv",
]);

/**
 * Returns true when the asset represents a document or report.
 * Criteria (any of):
 *   1. Asset has role "report" or "metadata"
 *   2. Asset MIME type matches a known document format
 */
export function isReportAsset(asset: STACAsset): boolean {
    if (asset.roles?.some((r) => REPORT_ROLES.has(r))) return true;
    return !!asset.type && REPORT_MIMES.has(asset.type);
}
