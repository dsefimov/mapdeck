/**
 * Compute exponential backoff delay for failed node loads.
 * Pure function — deterministic, no side effects.
 */

/**
 * Compute the retry delay in milliseconds for a node that failed to load.
 *
 * @param errorMessage - The error message string (from node.error).
 * @param retryCount - Number of consecutive prior retries.
 * @returns Delay in milliseconds before next retry attempt.
 */
export function computeRetryDelay(
    errorMessage: string,
    retryCount: number,
): number {
    const isCacheError = errorMessage.includes(
        "ERR_CACHE_OPERATION_NOT_SUPPORTED",
    );
    const baseDelay = isCacheError ? 10_000 : 1_000;
    return Math.min(baseDelay * Math.pow(2, retryCount), 60_000);
}
