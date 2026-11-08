import type { ReactNode } from "react";
import { cn } from "../../../utils/cn";
import { Text } from "../text/Text";
import { InputLabel } from "../inputs/InputLabel";
import styles from "./Field.module.css";

export interface FieldProps {
    /** Label content: text or formatted message */
    label: ReactNode;
    /** Id of the control the label is bound to */
    htmlFor: string;
    /** `Text` variant of the label: "body" or "caption" */
    labelVariant?: "body" | "caption";
    children: ReactNode;
    /** Extra hint below the control */
    hint?: ReactNode;
    /** Validation error below the control (hint, red) */
    error?: ReactNode;
    className?: string | undefined;
}

/**
 * Field: label + control, optional hint and error.
 */
export const Field: (props: FieldProps) => ReactNode = ({
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
            <InputLabel htmlFor={htmlFor} variant={labelVariant}>
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

