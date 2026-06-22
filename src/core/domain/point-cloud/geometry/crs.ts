/**
 * Extract PROJCS portion from a potentially COMPD_CS WKT string.
 * Returns PROJCS substring, or the original string if no COMPD_CS wrapper.
 * No @core imports — safe for both main-thread code and Web Workers.
 */
export function extractProjcsFromWkt(wkt: string): string {
    if (!wkt.startsWith("COMPD_CS[")) return wkt;

    const projcsStart = wkt.indexOf("PROJCS[");
    if (projcsStart === -1) return wkt;

    let depth = 0;
    for (let i = projcsStart; i < wkt.length; i++) {
        if (wkt[i] === "[") depth++;
        if (wkt[i] === "]") {
            depth--;
            if (depth === 0) return wkt.substring(projcsStart, i + 1);
        }
    }

    return wkt;
}
