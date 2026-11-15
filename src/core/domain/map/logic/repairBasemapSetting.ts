import type { SettingOption } from "@core/contracts";

/** The config identity the options are built from. */
export interface BasemapOptionSource {
    readonly id: string;
    readonly name: string;
}

/** What the repair may change about the basemap setting; absent = keep as is. */
export interface BasemapSettingRepair {
    readonly options: SettingOption[];
    readonly value?: string;
    readonly defaultValue?: string;
}

/** The registered setting's current value/default the repair decides against. */
export interface BasemapSettingState {
    readonly value: string | undefined;
    readonly defaultValue: string | undefined;
}

/**
 * Derive the basemap select's options from the registered configs and repair
 * a value/default that no longer names a registered basemap (an id dangling
 * since a custom assembly, or the initial empty default). An empty registry
 * touches nothing — there is nothing valid to point at, and the first
 * registration runs the repair again.
 */
export function repairBasemapSetting(
    configs: readonly BasemapOptionSource[],
    current: BasemapSettingState,
): BasemapSettingRepair {
    const options = configs.map(({ id, name }) => ({ label: name, value: id }));
    const first = options[0]?.value;
    if (first === undefined) return { options };

    const ids = new Set(options.map((option) => option.value));
    return {
        options,
        ...(current.value !== undefined && ids.has(current.value)
            ? {}
            : { value: first }),
        ...(current.defaultValue !== undefined && ids.has(current.defaultValue)
            ? {}
            : { defaultValue: first }),
    };
}
