import React from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./TextInput.module.css";

export interface TextInputProps {
    id: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string | undefined;
}

export const TextInput: (props: TextInputProps) => React.ReactNode = ({
    id,
    value,
    onChange,
    disabled,
    className,
}) => {
    return (
        <input
            id={id}
            type="text"
            className={cn(styles.input, className)}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
        />
    );
};
