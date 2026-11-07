import React from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./CheckboxInput.module.css";

export interface CheckboxInputProps {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    /** Accessible name for the checkbox when there is no visible label */
    ariaLabel?: string;
    className?: string | undefined;
}

export const CheckboxInput: (props: CheckboxInputProps) => React.ReactNode = ({
    id,
    checked,
    onChange,
    disabled,
    ariaLabel,
    className,
}) => {
    return (
        <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            aria-label={ariaLabel}
            className={cn(styles.input, className)}
        />
    );
};
