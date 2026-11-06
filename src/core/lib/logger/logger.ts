/**
 * Minimal logging wrapper with a configurable threshold. The default
 * ("warn") fits a shipped library — quiet unless something is wrong; the
 * assembly raises it (the demo's dev build enables debug) through
 * `configureLogger`. No bundler-specific environment probing here.
 */

/** Severity levels. */
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let threshold: LogLevel = "warn";

/** Set the global log threshold; messages below it are dropped. */
export function configureLogger(level: LogLevel): void {
    threshold = level;
}

function passes(level: LogLevel): boolean {
    return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[threshold];
}

const PREFIX: Record<LogLevel, string> = {
    debug: "[mapdeck:debug]",
    info: "[mapdeck:info]",
    warn: "[mapdeck:warn]",
    error: "[mapdeck:error]",
};

export const logger = {
    debug: (...args: unknown[]): void => {
        if (passes("debug")) {
            console.debug(PREFIX.debug, ...args);
        }
    },

    info: (...args: unknown[]): void => {
        if (passes("info")) {
            console.info(PREFIX.info, ...args);
        }
    },

    warn: (...args: unknown[]): void => {
        if (passes("warn")) {
            console.warn(PREFIX.warn, ...args);
        }
    },

    error: (...args: unknown[]): void => {
        if (passes("error")) {
            console.error(PREFIX.error, ...args);
        }
    },
} as const;
