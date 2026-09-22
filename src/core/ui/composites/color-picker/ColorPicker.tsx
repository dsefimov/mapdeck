import React, { useCallback, useEffect, useState } from "react";
import { InputLabel } from "@core/ui/components/primitives/inputs";
import { ColorSlider } from "@core/ui/components/primitives/color-slider/ColorSlider";
import styles from "./ColorPicker.module.css";

export interface ColorPickerProps {
    value: string;
    label: string;
    onChange: (color: string) => void;
}

const HEX_REGEX = /^#?([0-9a-fA-F]{6})$/;

function isValidHex(value: string): boolean {
    return HEX_REGEX.test(value);
}

function formatHex(value: string): string {
    const clean = value.replace("#", "");
    if (clean.length === 6) return `#${clean}`;
    return value;
}

/**
 * Color: swatch + hex input + hue slider (ColorSlider).
 */
export const ColorPicker: (props: ColorPickerProps) => React.ReactNode = ({
    value,
    label,
    onChange,
}) => {
    const [hexInput, setHexInput] = useState(value);

    useEffect(() => {
        setHexInput(value);
    }, [value]);

    const handleHexChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const raw = e.target.value;
            setHexInput(raw);

            const formatted = formatHex(raw);
            if (isValidHex(formatted)) {
                onChange(formatted);
            }
        },
        [onChange],
    );

    const handleHexBlur = useCallback(() => {
        const formatted = formatHex(hexInput);
        if (isValidHex(formatted)) {
            setHexInput(formatted);
            onChange(formatted);
        } else {
            setHexInput(value);
        }
    }, [hexInput, onChange, value]);

    // Unique per instance: two pickers with the same label must not share
    // the slider id their InputLabel points at.
    const hueInputId = React.useId();

    return (
        <div className={styles.container}>
            <InputLabel htmlFor={hueInputId}>{label}</InputLabel>
            <div className={styles.row}>
                <div
                    className={styles.swatch}
                    style={{ backgroundColor: value }}
                />
                <input
                    type="text"
                    className={styles.hexInput}
                    value={hexInput}
                    onChange={handleHexChange}
                    onBlur={handleHexBlur}
                    maxLength={7}
                    placeholder="#000000"
                    aria-label={`${label} hex value`}
                />
            </div>
            <ColorSlider
                id={hueInputId}
                value={value}
                onChange={onChange}
                label={`${label} hue`}
            />
        </div>
    );
};

export default ColorPicker;
