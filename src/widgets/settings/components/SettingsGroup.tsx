import React, { useState } from "react";
import { observer } from "mobx-react-lite";
import type {
    SettingsGroup,
    RegisteredSetting,
} from "@core/contracts";
import { useRootStore } from "@core/shell";
import { typedDict } from "@core/lib/text";
import { resolveOwnerName } from "@core/common/settings/logic/resolveOwnerName";
import type { ValidationResult } from "@core/common/settings/logic/validateSettingValue";
import type { SettingsLocaleKey } from "../locale";
import { SETTINGS_ID } from "..";
import {
    TextInput,
    SelectInput,
    CheckboxInput,
    NumberInput,
} from "@core/ui/components/primitives/inputs";
import { Field, Button, Text } from "@core/ui/components";

import styles from "./Widget.module.css";

interface SettingsGroupProps {
    group: SettingsGroup;
    onChange: (settingId: string, value: unknown) => ValidationResult;
}

export const SettingsGroupComponent: (
    props: SettingsGroupProps,
) => React.ReactNode = observer(({ group, onChange }) => {
    const rootStore = useRootStore();
    const dict = typedDict<SettingsLocaleKey>(
        rootStore.localeStore.t(SETTINGS_ID),
    );
    const ownerName = resolveOwnerName(
        (ns) => rootStore.localeStore.t(ns),
        group,
    );
    return (
        <div className={styles.settings__group}>
            <div className={styles.settings__group_header}>
                <Text variant="title">{ownerName}</Text>
                <Button
                    size="sm"
                    title={dict["action.resetAll"]}
                    onClick={() =>
                        rootStore.settingsStore.resetOwnerSettings(
                            group.ownerId,
                        )
                    }
                >
                    {dict["action.resetAll"]}
                </Button>
            </div>
            <div className={styles.settings__group_content}>
                {group.settings.map((setting) => (
                    <SettingItem
                        key={setting.id}
                        setting={setting}
                        onChange={onChange}
                    />
                ))}
            </div>
        </div>
    );
});

interface SettingItemProps {
    setting: RegisteredSetting;
    onChange: (settingId: string, value: unknown) => ValidationResult;
}

const SettingItem: (props: SettingItemProps) => React.ReactNode = observer(
    ({ setting, onChange }) => {
        const rootStore = useRootStore();
        const dict = typedDict<SettingsLocaleKey>(
            rootStore.localeStore.t(SETTINGS_ID),
        );
        const [error, setError] = useState<string | undefined>();
        // The store replaces a setting's registration object on every write
        // (setSetting, resetOwnerSettings) — including a reset that restores
        // the same value a rejected edit never committed. A new object
        // retires the stale validation message and remounts the field (its
        // draft may hold the rejected value). Render-time adjust, not an
        // effect.
        const [prevSetting, setPrevSetting] = useState(setting);
        const [rejectedEpoch, setRejectedEpoch] = useState(0);
        if (setting !== prevSetting) {
            setPrevSetting(setting);
            if (error !== undefined) {
                setError(undefined);
                setRejectedEpoch((e) => e + 1);
            }
        }

        const handleChange = (value: unknown) => {
            const result = onChange(setting.id, value);
            if (!result.ok) {
                setError(dict[`validation.${result.reason}`]);
                return;
            }
            setError(undefined);
        };

        const settingLabel =
            rootStore.localeStore.t(setting.ownerId)[setting.id] ??
            setting.label;

        return (
            <Field
                label={settingLabel}
                htmlFor={setting.id}
                error={error}
                className={styles.settings__item}
            >
                <SettingInput
                    key={`${setting.id}-${rejectedEpoch}`}
                    setting={setting}
                    onChange={handleChange}
                />
            </Field>
        );
    },
);

interface SettingInputProps {
    setting: RegisteredSetting;
    onChange: (value: unknown) => void;
}

/** The `switch` on the discriminated union narrows value and options. */
const SettingInput = ({ setting, onChange }: SettingInputProps) => {
    switch (setting.type) {
        case "string":
            return (
                <TextInput
                    id={setting.id}
                    value={setting.value}
                    onChange={onChange}
                />
            );
        case "number":
            return (
                <NumberInput
                    id={setting.id}
                    value={setting.value}
                    min={setting.min}
                    max={setting.max}
                    step={setting.step ?? 1}
                    onChange={onChange}
                />
            );
        case "select":
            return (
                <SelectInput
                    id={setting.id}
                    value={setting.value}
                    options={setting.options}
                    onChange={onChange}
                />
            );
        case "boolean":
            return (
                <label
                    htmlFor={setting.id}
                    className={styles.settings__item_checkbox}
                >
                    <CheckboxInput
                        id={setting.id}
                        checked={setting.value}
                        onChange={onChange}
                    />
                </label>
            );
        default:
            return null;
    }
};
