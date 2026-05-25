import React, { useState } from "react";
import { observer } from "mobx-react-lite";
import type { SettingsGroup, RegisteredSetting } from "@core/framework/types";
import { useRootStore } from "@core/framework/store";
import { validateSettingValue } from "../utils/validateSettingValue";
import { SETTINGS_ID } from "..";
import {
    TextInput,
    SelectInput,
    CheckboxInput,
    NumberInput,
    type SelectOption,
} from "@core/ui/components/primitives/inputs";

import styles from "./Widget.module.css";

const safeStr = (v: unknown) => String(v ?? "");
const safeNum = (v: unknown) => Number(v ?? 0);
const safeBool = (v: unknown) => Boolean(v ?? false);
const safeSelectVal = (v: unknown, opts: SelectOption[] | undefined) =>
    String(v ?? opts?.[0]?.value ?? "");

interface SettingsGroupProps {
    group: SettingsGroup;
    onChange: (settingId: string, value: unknown) => void;
}

export const SettingsGroupComponent: (
    props: SettingsGroupProps,
) => React.ReactNode = observer(({ group, onChange }) => {
    const rootStore = useRootStore();
    const ownerName =
        rootStore.localeStore.t(group.ownerId)["widget.name"] ??
        rootStore.localeStore.t(group.ownerId)["tool.name"] ??
        group.ownerName;
    return (
        <div className={styles.settings__group}>
            <h3 className={styles.settings__group_title}>{ownerName}</h3>
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
    onChange: (settingId: string, value: unknown) => void;
}

const SettingItem: (props: SettingItemProps) => React.ReactNode = observer(
    ({ setting, onChange }) => {
        const rootStore = useRootStore();
        const dict = rootStore.localeStore.t(SETTINGS_ID);
        const [error, setError] = useState<string | undefined>();

        const handleChange = (value: unknown) => {
            const result = validateSettingValue(setting, value);
            if (!result.valid) {
                setError(dict[`validation.${result.error}`]!);
                return;
            }
            setError(undefined);
            onChange(setting.id, value);
        };

        const settingLabel =
            rootStore.localeStore.t(setting.ownerId)[setting.id] ??
            setting.label;

        return (
            <div className={styles.settings__item}>
                <label
                    htmlFor={setting.id}
                    className={styles.settings__item_label}
                >
                    {settingLabel}
                </label>
                <SettingInput
                    setting={setting}
                    value={setting.value}
                    onChange={handleChange}
                />
                {error && (
                    <p className={styles.settings__item_error}>{error}</p>
                )}
            </div>
        );
    },
);

interface SettingInputProps {
    setting: RegisteredSetting;
    value: unknown;
    onChange: (value: unknown) => void;
}

const SettingInput = ({ setting, value, onChange }: SettingInputProps) => {
    switch (setting.type) {
        case "string":
            return (
                <TextInput
                    id={setting.id}
                    value={safeStr(value)}
                    onChange={onChange}
                />
            );
        case "number":
            return (
                <NumberInput
                    id={setting.id}
                    value={safeNum(value)}
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
                    value={safeSelectVal(value, setting.options)}
                    options={setting.options ?? []}
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
                        checked={safeBool(value)}
                        onChange={onChange}
                    />
                </label>
            );
        default:
            return null;
    }
};
