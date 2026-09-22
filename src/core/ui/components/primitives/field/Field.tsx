import React from "react";
import { cn } from "@core/ui/utils/cn";
import { Text } from "@core/ui/components/primitives/text/Text";
import { InputLabel } from "@core/ui/components/primitives/inputs/InputLabel";
import styles from "./Field.module.css";

export interface FieldProps {
    /** Label content: text or formatted message */
    label: React.ReactNode;
    /** Id of the control the label is bound to */
    htmlFor: string;
    /** Label visual variant: "default" — body, "caption" — uppercase label */
    labelVariant?: "default" | "caption";
    children: React.ReactNode;
    /** Extra hint below the control */
    hint?: React.ReactNode;
    /** Validation error below the control (hint, red) */
    error?: React.ReactNode;
    className?: string | undefined;
}

/**
 * Field: label + control, optional hint and error.
 */
export const Field: (props: FieldProps) => React.ReactNode = ({
    label,
    htmlFor,
    labelVariant,
    children,
    hint,
    error,
    className,
}) => {
    return (
        <div className={cn(styles.field, className)}>
            <InputLabel htmlFor={htmlFor} variant={labelVariant ?? "default"}>
                {label}
            </InputLabel>
            {children}
            {hint && (
                <Text variant="hint" tone="muted">
                    {hint}
                </Text>
            )}
            {error && (
                <Text variant="hint" tone="error">
                    {error}
                </Text>
            )}
        </div>
    );
};

export default Field;
