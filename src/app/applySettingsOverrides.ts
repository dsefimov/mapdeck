import type { SettingsStore } from "@core/common/settings";

/**
 * Host-declared values for registered settings, keyed by setting id —
 * the payload of the facade's `settingsOverrides` option.
 */
export type SettingsOverrides = Readonly<
    Record<string, string | number | boolean>
>;

/**
 * Applies host-declared values to registered settings via the store's
 * validating setter. Every rejected id is collected and thrown as one
 * Error — bootstrap surfaces it through initError. `undefined` is a no-op.
 */
export function applySettingsOverrides(
    store: SettingsStore,
    overrides: SettingsOverrides | undefined,
): void {
    if (!overrides) return;
    const failures: string[] = [];
    for (const [id, value] of Object.entries(overrides)) {
        const result = store.setSetting(id, value);
        if (!result.ok) failures.push(`${id} (${result.reason})`);
    }
    if (failures.length > 0) {
        throw new Error(`settingsOverrides rejected: ${failures.join("; ")}`);
    }
}
