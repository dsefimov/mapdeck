import React from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./SliderInput.module.css";

export interface SliderInputProps {
    id: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (value: number) => void;
    /** Fires when the user finishes a pointer drag — the value is final. */
    onCommit?: () => void;
    disabled?: boolean;
    className?: string;
}

export const SliderInput: (props: SliderInputProps) => React.ReactNode = ({
    id,
    value,
    min,
    max,
    step,
    onChange,
    onCommit,
    disabled,
    className,
}) => {
    const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

    return (
        <input
            id={id}
            type="range"
            className={cn(styles.slider, className)}
            style={{ "--slider-fill": `${percent}%` } as React.CSSProperties}
            value={value}
            min={min}
            max={max}
            step={step ?? 1}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
            onPointerUp={onCommit}
        />
    );
};
