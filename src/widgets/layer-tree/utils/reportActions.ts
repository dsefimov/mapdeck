import { downloadFile } from "@core/ui/utils";
import { logger } from "@core/lib/logger";

/**
 * Open a report in a new tab. `opener` is nulled so the report page
 * cannot reach back into the app via `window.opener`.
 * Best-effort by design: a URL-less report only logs.
 */
export function openReport(url: string, label: string): void {
    if (!url) {
        logger.warn(`Report "${label}" has no URL`);
        return;
    }
    const newWindow = window.open(url, "_blank");
    if (newWindow) {
        newWindow.opener = null;
    }
}

/** Download a report file, named by its label. Best-effort: a URL-less report only logs. */
export function downloadReport(url: string, label: string): void {
    if (!url) {
        logger.warn(`Report "${label}" has no URL`);
        return;
    }
    void downloadFile(url, label);
}
