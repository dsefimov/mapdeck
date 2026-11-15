/**
 * Triggers a file download.
 *
 * The plain-anchor `download` attribute is ignored for cross-origin URLs —
 * the browser navigates away instead of saving. Fetching the bytes first and
 * downloading from an object URL keeps the save dialog for URLs the page is
 * allowed to read; when it is not (CORS), the anchor fallback navigates —
 * best effort, the only option left.
 */
export async function downloadFile(
    url: string,
    filename: string,
): Promise<void> {
    try {
        const response = await fetch(url);
        if (response.ok) {
            const blobUrl = URL.createObjectURL(await response.blob());
            triggerAnchor(blobUrl, filename, true);
            return;
        }
    } catch {
        // Not readable from this origin — fall through to navigation.
    }
    triggerAnchor(url, filename, false);
}

/** Safari/Firefox cancel the download if the blob URL dies before the
 *  browser picks it up — revoke late, never synchronously with the click. */
const REVOKE_DELAY_MS = 1000;

function triggerAnchor(
    href: string,
    filename: string,
    revoke: boolean,
): void {
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.click();
    if (revoke) {
        setTimeout(() => URL.revokeObjectURL(href), REVOKE_DELAY_MS);
    }
}
