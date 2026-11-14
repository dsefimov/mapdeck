import type { RegisteredSetting, SettingMetadata } from "@core/contracts";
import { applyRegistration } from "@core/lib/registry";
import type { RegisterOptions } from "@core/lib/registry";

/** A batch of settings declared under one owner. */
export interface SettingsRegistration {
    readonly ownerId: string;
    readonly ownerName: string;
    readonly settings: SettingMetadata[];
    /** Explicitly `undefined` when the caller passes no options. */
    readonly opts: RegisterOptions | undefined;
}

/** Attaches ownership and the default value to a metadata variant. */
function toRegistered(
    metadata: SettingMetadata,
    registration: SettingsRegistration,
): RegisteredSetting {
    const base = {
        ownerId: registration.ownerId,
        ownerName: registration.ownerName,
    };
    switch (metadata.type) {
        case "string":
            return { ...metadata, ...base, value: String(metadata.defaultValue) };
        case "number":
            return { ...metadata, ...base, value: Number(metadata.defaultValue) };
        case "select":
            return { ...metadata, ...base, value: metadata.defaultValue };
        case "boolean":
            return { ...metadata, ...base, value: Boolean(metadata.defaultValue) };
        case "color":
            return { ...metadata, ...base, value: metadata.defaultValue };
    }
}

/** Throws on any id collision the options do not cover — before a single write. */
function assertBatchRegistrable(
    settings: Map<string, RegisteredSetting>,
    registration: SettingsRegistration,
): void {
    for (const metadata of registration.settings) {
        const existing = settings.get(metadata.id);
        if (existing && !registration.opts?.override) {
            throw new Error(
                `Setting "${metadata.id}" is already registered (owner "${existing.ownerId}")`,
            );
        }
    }
}

/** Writes the batch through the per-key policy; collisions are already validated. */
function commitBatch(
    settings: Map<string, RegisteredSetting>,
    registration: SettingsRegistration,
): void {
    for (const metadata of registration.settings) {
        applyRegistration(settings, {
            label: "Setting",
            key: metadata.id,
            item: toRegistered(metadata, registration),
            opts: registration.opts,
        });
    }
}

/** Drops the owner's previous ids the new batch no longer declares. */
function dropStaleOwnerIds(
    settings: Map<string, RegisteredSetting>,
    registration: SettingsRegistration,
): void {
    const declared = new Set(registration.settings.map((metadata) => metadata.id));
    for (const [id, setting] of settings) {
        if (setting.ownerId === registration.ownerId && !declared.has(id)) {
            settings.delete(id);
        }
    }
}

/**
 * Registers a batch of settings under one owner with the common
 * registration policy: an id collision without `{ override: true }`
 * throws before anything is written — the batch is atomic. An override
 * replaces the colliding settings and drops the owner's previous batch,
 * so a re-registered owner (an overridden widget or tool) leaves no
 * stale ids behind; without an override an empty batch is a no-op —
 * owners collide across kinds (a tool and its panel widget share the
 * id), so a declaration-less registration must not wipe the owner's
 * settings. Only the batch-level steps are own code — validation
 * (atomicity, the colliding owner in the error) and stale-id cleanup;
 * the per-key write rides `applyRegistration`.
 */
export function applySettingsRegistration(
    settings: Map<string, RegisteredSetting>,
    registration: SettingsRegistration,
): void {
    assertBatchRegistrable(settings, registration);
    commitBatch(settings, registration);
    if (registration.opts?.override) {
        dropStaleOwnerIds(settings, registration);
    }
}
