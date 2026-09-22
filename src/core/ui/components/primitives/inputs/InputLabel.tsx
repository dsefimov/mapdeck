import React from "react";
import { cn } from "@core/ui/utils/cn";
import { Text } from "@core/ui/components/primitives/text/Text";
import styles from "./InputLabel.module.css";

export interface InputLabelProps {
    /** Maps to native `for` attribute, associates label with an input */
    htmlFor: string;
    /** Label content (text, formatted messages, etc.) */
    children: React.ReactNode;
    /** Visual variant: "default" for body text, "caption" for small uppercase */
    variant?: "default" | "caption";
    className?: string;
}

export const InputLabel: (props: InputLabelProps) => React.ReactNode = ({
    htmlFor,
    children,
    variant = "default",
    className,
}) => {
    const content =
        variant === "caption" ? (
            <Text variant="caption">{children}</Text>
        ) : (
            <Text variant="body">{children}</Text>
        );

    return (
        <label htmlFor={htmlFor} className={cn(styles.label, className)}>
            {content}
        </label>
    );
};
