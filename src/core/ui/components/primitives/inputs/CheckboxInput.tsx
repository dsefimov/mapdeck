import React from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./CheckboxInput.module.css";

export interface CheckboxInputProps {
    id: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
    className?: string | undefined;
}

export const CheckboxInput: (props: CheckboxInputProps) => React.ReactNode = ({
    id,
    checked,
    onChange,
    disabled,
    className,
}) => {
    return (
        <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className={cn(styles.input, className)}
        />
    );
};
