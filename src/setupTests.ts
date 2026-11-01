/**
 * Shared vitest setup, wired through `test.setupFiles`.
 *
 * MobX strictness reports as "[MobX]" console warnings (ADR-0001) — a
 * warning the suite tolerates is a guarantee nobody checks, so here it
 * fails the test that triggered it.
 */
type ConsoleFn = (...args: unknown[]) => void;

function failOnMobxViolations(level: "warn" | "error", original: ConsoleFn): ConsoleFn {
    return (...args: unknown[]) => {
        const text = args.map(String).join(" ");
        if (text.includes("[MobX]")) {
            throw new Error(
                `MobX strictness violation (${level}): ${text}`,
            );
        }
        original(...args);
    };
}

console.warn = failOnMobxViolations("warn", console.warn.bind(console));
console.error = failOnMobxViolations("error", console.error.bind(console));
