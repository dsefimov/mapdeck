import type { ReactNode } from "react";
import { cn } from "../../../utils/cn";
import { useFieldAria } from "../field/FieldContext";
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

export const CheckboxInput: (props: CheckboxInputProps) => ReactNode = ({
    id,
    checked,
    onChange,
    disabled,
    ariaLabel,
    className,
}) => {
    const field = useFieldAria();
    return (
        <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-describedby={field.describedBy}
            aria-invalid={field.invalid || undefined}
            className={cn(styles.input, className)}
        />
    );
};
