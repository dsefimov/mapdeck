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
    onCommit?: () => void;
    disabled?: boolean;
    /** Accessible name for the slider when there is no visible label */
    ariaLabel?: string;
    className?: string | undefined;
}

const VALUE_KEYS: ReadonlySet<string> = new Set([
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Home",
    "End",
    "PageUp",
    "PageDown",
]);

export const SliderInput: (props: SliderInputProps) => React.ReactNode = ({
    id,
    value,
    min,
    max,
    step,
    onChange,
    onCommit,
    disabled,
    ariaLabel,
    className,
}) => {
    const raw = max > min ? ((value - min) / (max - min)) * 100 : 0;
    const percent = Math.min(100, Math.max(0, raw));

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
            aria-label={ariaLabel}
            onChange={(e) => onChange(Number(e.target.value))}
            onPointerUp={onCommit}
            onKeyUp={(e) => {
                if (VALUE_KEYS.has(e.key)) onCommit?.();
            }}
            onBlur={onCommit}
        />
    );
};
