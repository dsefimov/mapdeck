const FALLBACK_BASE = "http://localhost";
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Parse a URL that may be document-relative. An embedded library receives
 * page-relative hrefs (same-origin APIs); they resolve against the document
 * base before any URL part is read. Only plain HTTP(S) URLs pass — anything
 * else (javascript:, data:, …) coming from an untrusted catalog throws
 * instead of reaching the network. Without a document (SSR, plain unit
 * tests) a relative URL resolves against a localhost stub.
 */
export function parseUrl(url: string, base?: string): URL {
    const documentBase =
        typeof document !== "undefined" ? document.baseURI : FALLBACK_BASE;
    const parsed = new URL(url, base ?? documentBase);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
        throw new Error(`Unsupported URL protocol: ${parsed.protocol}`);
    }
    return parsed;
}
