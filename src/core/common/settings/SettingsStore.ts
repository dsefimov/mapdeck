import { makeAutoObservable } from "mobx";
import type {
    RegisteredSetting,
    SettingMetadata,
    SettingOption,
    SettingsGroup,
    SettingsRegistrationPort,
} from "@core/contracts";
import { logger } from "@core/lib/logger";
import { groupSettingsByOwner } from "./logic/groupSettingsByOwner";
import {
    validateSettingValue,
    type ValidationResult,
} from "./logic/validateSettingValue";

/** Attaches ownership to a metadata variant — each branch keeps its discriminant. */
function toRegistered(
    metadata: SettingMetadata,
    ownerId: string,
    ownerName: string,
): RegisteredSetting {
    const base = { ownerId, ownerName };
    switch (metadata.type) {
        case "string":
            return {
                ...metadata,
                ...base,
                value: String(metadata.defaultValue),
            };
        case "number":
            return {
                ...metadata,
                ...base,
                value: Number(metadata.defaultValue),
            };
        case "select":
            return {
                ...metadata,
                ...base,
                value: metadata.defaultValue,
            };
        case "boolean":
            return {
                ...metadata,
                ...base,
                value: Boolean(metadata.defaultValue),
            };
    }
}

/**
 * Re-values an already validated setting. The conversions are no-ops —
 * validateSettingValue has guaranteed the value matches the variant.
 */
function withValue(
    setting: RegisteredSetting,
    value: string | number | boolean,
): RegisteredSetting {
    switch (setting.type) {
        case "string":
            return { ...setting, value: String(value) };
        case "select":
            return { ...setting, value: String(value) };
        case "number":
            return { ...setting, value: Number(value) };
        case "boolean":
            return { ...setting, value: Boolean(value) };
    }
}

export class SettingsStore implements SettingsRegistrationPort {
    private _settings = new Map<string, RegisteredSetting>();

    constructor() {
        makeAutoObservable(this);
    }

    /**
     * Register a batch of settings under one owner. An empty array is a no-op.
     * Duplicate ids throw — registry policy: a colliding id
     * is a programming error that must surface at registration, not silently
     * replace another extension's setting.
     */
    registerSettings(
        ownerId: string,
        ownerName: string,
        settings: SettingMetadata[],
    ): void {
        for (const metadata of settings) {
            const setting = toRegistered(metadata, ownerId, ownerName);

            const existing = this._settings.get(metadata.id);
            if (existing) {
                throw new Error(
                    `Setting "${metadata.id}" is already registered (owner "${existing.ownerId}")`,
                );
            }

            this._settings.set(metadata.id, setting);
        }
    }

    /**
     * Get a string or select setting value
     */
    getStringSetting(settingId: string): string | undefined {
        const setting = this._settings.get(settingId);
        if (setting?.type === "string" || setting?.type === "select") {
            return setting.value;
        }
        return undefined;
    }

    /**
     * Get a number setting value
     */
    getNumberSetting(settingId: string): number | undefined {
        const setting = this._settings.get(settingId);
        if (setting?.type === "number") {
            return setting.value;
        }
        return undefined;
    }

    /**
     * Get a boolean setting value
     */
    getBooleanSetting(settingId: string): boolean | undefined {
        const setting = this._settings.get(settingId);
        if (setting?.type === "boolean") {
            return setting.value;
        }
        return undefined;
    }

    /**
     * Set a setting value by ID. Validates type, range and select options;
     * on success the stored value is updated, otherwise it is left unchanged
     * and the rejection reason is returned.
     */
    // Arrow property on purpose: handed to inputs as an unbound onChange
    // callback, a method would lose `this`.
    setSetting = (settingId: string, value: unknown): ValidationResult => {
        const setting = this._settings.get(settingId);
        if (!setting) {
            logger.error(`Setting "${settingId}" not found`);
            return { ok: false, reason: "notfound" };
        }

        const result = validateSettingValue(setting, value);
        if (!result.ok) {
            logger.error(
                `Setting "${settingId}" rejected value: ${result.reason}`,
            );
            return result;
        }

        this._settings.set(settingId, withValue(setting, result.value));
        return { ok: true, value: result.value };
    };

    /**
     * Replace the declared options of a registered select setting in place,
     * preserving owner and current value. Non-select or unregistered ids are
     * a no-op. When `defaultValue` is provided it replaces the declared
     * default — the basemap registry uses this to keep the default pointing
     * at a registered basemap after a custom assembly.
     */
    updateSettingOptions(
        settingId: string,
        options: SettingOption[],
        defaultValue?: string,
    ): void {
        const setting = this._settings.get(settingId);
        if (!setting) {
            logger.warn(
                `Cannot update options for unknown setting "${settingId}"`,
            );
            return;
        }
        if (setting.type !== "select") {
            logger.warn(
                `Cannot update options for non-select setting "${settingId}"`,
            );
            return;
        }

        this._settings.set(settingId, {
            ...setting,
            options,
            ...(defaultValue === undefined ? {} : { defaultValue }),
        });
    }

    /**
     * Get all settings grouped by owner
     */
    get allSettingsGrouped(): SettingsGroup[] {
        return groupSettingsByOwner(Array.from(this._settings.values()));
    }

    /**
     * Get settings for a specific owner
     */
    getOwnerSettings(ownerId: string): RegisteredSetting[] {
        return Array.from(this._settings.values()).filter(
            (setting) => setting.ownerId === ownerId,
        );
    }

    /**
     * Reset a setting to its default value
     */
    resetSetting(settingId: string): void {
        const setting = this._settings.get(settingId);
        if (!setting) {
            logger.error(`Setting "${settingId}" not found`);
            return;
        }

        this._settings.set(settingId, withValue(setting, setting.defaultValue));
    }

    /**
     * Reset all settings for an owner to their default values
     */
    resetOwnerSettings(ownerId: string): void {
        const ownerSettings = this.getOwnerSettings(ownerId);
        ownerSettings.forEach((setting) => {
            this._settings.set(
                setting.id,
                withValue(setting, setting.defaultValue),
            );
        });
    }
}
