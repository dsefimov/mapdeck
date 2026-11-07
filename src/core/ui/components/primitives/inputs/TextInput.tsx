import React from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./TextInput.module.css";

export interface TextInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    maxLength?: number;
    onBlur?: () => void;
    disabled?: boolean;
    /** Accessible name for the input when there is no visible label */
    ariaLabel?: string;
    className?: string | undefined;
}

export const TextInput: (props: TextInputProps) => React.ReactNode = ({
    id,
    value,
    onChange,
    maxLength,
    onBlur,
    disabled,
    ariaLabel,
    className,
}) => {
    return (
        <input
            id={id}
            type="text"
            className={cn(styles.input, className)}
            value={value}
            maxLength={maxLength}
            onBlur={onBlur}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={(e) => onChange(e.target.value)}
        />
    );
};
