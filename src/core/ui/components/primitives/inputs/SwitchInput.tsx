import React from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./SwitchInput.module.css";

export interface SwitchInputProps {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    /** Accessible name for the switch when there is no visible label */
    ariaLabel?: string;
    className?: string;
}

export const SwitchInput: (props: SwitchInputProps) => React.ReactNode = ({
    id,
    checked,
    onChange,
    disabled,
    ariaLabel,
    className,
}) => {
    return (
        <label
            htmlFor={id}
            className={cn(
                styles.switch,
                checked && styles.checked,
                disabled && styles.disabled,
                className,
            )}
        >
            <input
                id={id}
                type="checkbox"
                role="switch"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
                aria-label={ariaLabel}
                className={styles.input}
            />
            <span className={styles.track}>
                <span className={styles.thumb} />
            </span>
        </label>
    );
};
