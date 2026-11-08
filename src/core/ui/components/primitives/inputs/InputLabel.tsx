import React from "react";
import { cn } from "@core/ui/utils/cn";
import { Text } from "@core/ui/components/primitives/text/Text";
import styles from "./InputLabel.module.css";

export interface InputLabelProps {
    /** Maps to native `for` attribute, associates label with an input */
    htmlFor: string;
    /** Label content (text, formatted messages, etc.) */
    children: React.ReactNode;
    /** `Text` variant of the label content */
    variant?: "body" | "caption" | undefined;
    className?: string | undefined;
}

export const InputLabel: (props: InputLabelProps) => React.ReactNode = ({
    htmlFor,
    children,
    variant = "body",
    className,
}) => (
    <label htmlFor={htmlFor} className={cn(styles.label, className)}>
        <Text variant={variant}>{children}</Text>
    </label>
);
