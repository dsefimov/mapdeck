/**
 * Settings type definitions for the Mapdeck settings system
 */

/** Value types a setting can hold. */
export type SettingType = "string" | "number" | "select" | "boolean";

/** One choice of a select setting. */
export interface SettingOption {
    label: string;
    value: string;
}

interface BaseSettingMetadata {
    id: string;
    label: string;
}

/** Metadata of a string setting. */
export interface StringSettingMetadata extends BaseSettingMetadata {
    type: "string";
    defaultValue: string;
}

/** Metadata of a number setting. */
export interface NumberSettingMetadata extends BaseSettingMetadata {
    type: "number";
    defaultValue: number;
    min?: number;
    max?: number;
    step?: number;
}

/** Metadata of a select setting. */
export interface SelectSettingMetadata extends BaseSettingMetadata {
    type: "select";
    defaultValue: string;
    options: SettingOption[];
}

/** Metadata of a boolean setting. */
export interface BooleanSettingMetadata extends BaseSettingMetadata {
    type: "boolean";
    defaultValue: boolean;
}

/** Union of every setting-metadata variant. */
export type SettingMetadata =
    | StringSettingMetadata
    | NumberSettingMetadata
    | SelectSettingMetadata
    | BooleanSettingMetadata;

// Registered setting with owner info and current value.
// The value is typed per variant — registration always initializes it to the
// declared defaultValue, so a registered value is never absent.
/** A declared setting extended with its owner and current value. */
export type RegisteredSetting =
    | (StringSettingMetadata & {
          ownerId: string;
          ownerName: string;
          value: string;
      })
    | (NumberSettingMetadata & {
          ownerId: string;
          ownerName: string;
          value: number;
      })
    | (SelectSettingMetadata & {
          ownerId: string;
          ownerName: string;
          value: string;
      })
    | (BooleanSettingMetadata & {
          ownerId: string;
          ownerName: string;
          value: boolean;
      });

/** An owner's registered settings shown as one group. */
export interface SettingsGroup {
    ownerId: string;
    ownerName: string;
    settings: RegisteredSetting[];
}

/**
 * Registration port over the settings subsystem: what modules
 * declare their settings through. A read port joins the runtime slice when
 * a real reader appears.
 */
export interface SettingsRegistrationPort {
    /** Declare an owner's settings — values initialize to their defaults. */
    registerSettings(
        ownerId: string,
        ownerName: string,
        settings: SettingMetadata[],
    ): void;
}
