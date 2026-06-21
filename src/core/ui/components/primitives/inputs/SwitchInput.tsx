import React from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./SwitchInput.module.css";

export interface SwitchInputProps {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
}

export const SwitchInput: React.FC<SwitchInputProps> = ({
    id,
    checked,
    onChange,
    disabled,
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
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                disabled={disabled}
                className={styles.input}
            />
            <span className={styles.track}>
                <span className={styles.thumb} />
            </span>
        </label>
    );
};
