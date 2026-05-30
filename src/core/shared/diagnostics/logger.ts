/**
 * Minimal logging wrapper that respects environment mode
 * - In development: Shows all logs (debug, info, warn, error)
 * - In production: Shows only warnings and errors
 */

const isDevelopment = import.meta.env?.MODE === "development";

export const logger = {
    debug: (...args: unknown[]): void => {
        if (isDevelopment) {
            console.log("[DEBUG]", ...args);
        }
    },

    info: (...args: unknown[]): void => {
        if (isDevelopment) {
            console.info("[INFO]", ...args);
        }
    },

    warn: (...args: unknown[]): void => {
        console.warn("[WARN]", ...args);
    },

    error: (...args: unknown[]): void => {
        console.error("[ERROR]", ...args);
    },
} as const;
