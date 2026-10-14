import { parseUrl } from "@core/lib/url/parseUrl";

/**
 * Append query parameters to a URL, preserving existing ones.
 * @param baseUrl - absolute or document-relative URL, may already carry
 * query parameters
 * @param params - values are inserted verbatim
 */
export function appendUrlParams(
    baseUrl: string,
    params: Record<string, string>,
): string {
    const url = parseUrl(baseUrl);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}
