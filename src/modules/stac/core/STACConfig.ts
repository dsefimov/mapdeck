export interface STACConfig {
    /** STAC catalog URL (required) */
    url: string;

    /** Base URL for relative links (optional) */
    baseUrl?: string;

    /** Request timeout in milliseconds (optional, default: 10000) */
    timeout?: number;

    /** Additional HTTP headers (optional) */
    headers?: Record<string, string>;
}
