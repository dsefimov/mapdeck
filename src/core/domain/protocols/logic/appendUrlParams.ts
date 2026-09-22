/**
 * Append query parameters to a URL, preserving existing ones.
 * @param baseUrl - absolute URL, may already carry query parameters
 * @param params - values are inserted verbatim
 */
export function appendUrlParams(
    baseUrl: string,
    params: Record<string, string>,
): string {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
    }
    return url.toString();
}
