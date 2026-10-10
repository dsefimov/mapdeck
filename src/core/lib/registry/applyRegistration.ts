import { logger } from "@core/lib/logger";
import type { RegisterOptions } from "./Registry";

/** What `applyRegistration` needs besides the holder map. */
export interface RegistrationEntry<K, T> {
    /** Names the entries in error/warning messages, e.g. "Feature provider". */
    readonly label: string;
    readonly key: K;
    readonly item: T;
    /** Explicitly `undefined` when the caller passes no options. */
    readonly opts: RegisterOptions | undefined;
}

/**
 * The single home of the registration-override semantics: registering under
 * an occupied key throws — the extension set is fixed at build time, so an
 * accidental duplicate is a programming error caught at startup; a deliberate
 * replacement passes `{ override: true }` and is visible as a logged warning.
 * Works over any Map-shaped holder (plain or observable), so observable
 * registries reuse the policy without wrapping a class.
 */
export function applyRegistration<K, T>(
    entries: Map<K, T>,
    registration: RegistrationEntry<K, T>,
): void {
    const { label, key, item, opts } = registration;
    if (entries.has(key)) {
        if (!opts?.override) {
            throw new Error(`${label} "${String(key)}" is already registered.`);
        }
        logger.warn(
            `${label} registry: overriding "${String(key)}" (explicit override).`,
        );
    }
    entries.set(key, item);
}
