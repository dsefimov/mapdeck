import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Console error guard: collects what the page reports and fails the test
 * on anything not on the known-harmless list. The noise filter is the
 * contract — extending it requires saying why here.
 */
const HARMLESS_PATTERNS: RegExp[] = [
    // The demo has no favicon wired up.
    /favicon\.ico/,
    // Chrome HTTP-cache quirk on range requests; the engine detects the
    // marker and retries with its own backoff — self-healing by design.
    /ERR_CACHE_OPERATION_NOT_SUPPORTED/,
];

export interface ConsoleGuard {
    /** Fail the test if any non-harmless error was logged. */
    assertClean(label: string): Promise<void>;
}

/** Attach the collector to the page; assert before the test ends. */
export function collectConsoleErrors(page: Page): ConsoleGuard {
    const errors: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") {
            errors.push(message.text());
        }
    });
    page.on("pageerror", (error) => {
        errors.push(`pageerror: ${String(error)}`);
    });

    return {
        async assertClean(label: string): Promise<void> {
            const fatal = errors.filter(
                (text) =>
                    !HARMLESS_PATTERNS.some((pattern) => pattern.test(text)),
            );
            expect(fatal, `[${label}] console must stay clean`).toEqual([]);
        },
    };
}
