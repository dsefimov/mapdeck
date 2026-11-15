import { logger } from "@core/lib/logger";

/**
 * Routes errors neither React nor the app's own code can catch to the
 * logger: without these listeners an async failure is visible only in the
 * browser console of whoever happens to have it open. Installed once
 * before the first launch so the handlers survive store re-creation.
 */
export function installGlobalErrorHandlers(): void {
    window.addEventListener("error", (event) => {
        // Resource-load failures carry no Error object — the message with
        // the target URL is the only clue they leave.
        if (event.error instanceof Error) {
            logger.error("Uncaught error:", event.error);
        } else {
            logger.error(`Resource failed to load: ${event.message}`);
        }
    });

    window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason instanceof Error ? event.reason : String(event.reason);
        logger.error("Unhandled promise rejection:", reason);
    });
}
