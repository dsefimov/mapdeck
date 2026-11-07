import React, { useState } from "react";
import { hexToHue, hueToHex, normalizeHex } from "@core/lib/color";
import { interpolate, typedDict } from "@core/lib/text";
import { InputLabel, TextInput } from "@core/ui/components/primitives/inputs";
import { ColorSlider } from "@core/ui/components/primitives/color-slider/ColorSlider";
import styles from "./ColorPicker.module.css";

/** Core-namespace keys the picker reads (typed view, no fallbacks). */
type ColorPickerKey = "colorPicker.hexField" | "colorPicker.hueField";

export interface ColorPickerProps {
    value: string;
    label: string;
    /** Core dictionary carrying `colorPicker.hexField` / `colorPicker.hueField` */
    dict: Record<string, string>;
    onChange: (color: string) => void;
}

/**
 * Color picker: swatch + hex field + hue slider. Hue is the slider state;
 * it is recomputed from `value` only when the external color is not the
 * one the current hue would produce — dragging never fights the prop,
 * and the 360° red edge or a gray value never snaps the thumb.
 */
export const ColorPicker: (props: ColorPickerProps) => React.ReactNode = ({
    value,
    label,
    dict,
    onChange,
}) => {
    const labels = typedDict<ColorPickerKey>(dict);

    const [hue, setHue] = useState(() => hexToHue(value));
    const [hexInput, setHexInput] = useState(value);

    // Render-time adjust (React docs pattern, not an effect): an external
    // value change retires drafts that no longer match it.
    const [prevValue, setPrevValue] = useState(value);
    if (value !== prevValue) {
        setPrevValue(value);
        setHexInput(value);
        if (value.toLowerCase() !== hueToHex(hue)) {
            setHue(hexToHue(value));
        }
    }

    const handleHexChange = (raw: string): void => {
        setHexInput(raw);
        const normalized = normalizeHex(raw);
        if (normalized) onChange(normalized);
    };

    const handleHexBlur = (): void => {
        const normalized = normalizeHex(hexInput);
        setHexInput(normalized ?? value);
    };

    const handleHueChange = (nextHue: number): void => {
        setHue(nextHue);
        onChange(hueToHex(nextHue));
    };

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
                <TextInput
                    id={`${hueInputId}-hex`}
                    value={hexInput}
                    onChange={handleHexChange}
                    onBlur={handleHexBlur}
                    maxLength={7}
                    className={styles.hexInput}
                    ariaLabel={interpolate(labels["colorPicker.hexField"], {
                        label,
                    })}
                />
            </div>
            <ColorSlider
                id={hueInputId}
                value={hue}
                onChange={handleHueChange}
                label={interpolate(labels["colorPicker.hueField"], { label })}
            />
        </div>
    );
};
