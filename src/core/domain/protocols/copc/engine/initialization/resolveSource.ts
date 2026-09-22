import type { Getter } from "copc";

/**
 * Resolves a relative URL to absolute URL.
 * If already absolute (http/https), returns as-is.
 */
export function resolveUrl(url: string): string {
    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }

    if (typeof window !== "undefined" && window.location) {
        try {
            return new URL(url, window.location.origin).href;
        } catch {
            return url;
        }
    }

    return url;
}

/**
 * Creates a getter function from an ArrayBuffer for copc.js.
 * Getter is of the form (begin, end) => Uint8Array.
 */
export function createBufferGetter(buffer: ArrayBuffer): Getter {
    const uint8 = new Uint8Array(buffer);
    return async (begin: number, end: number): Promise<Uint8Array> => {
        return new Uint8Array(uint8.subarray(begin, end));
    };
}
