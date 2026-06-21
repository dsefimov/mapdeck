import React from "react";
import { cn } from "@core/ui/utils/cn";
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

export const InputLabel: React.FC<InputLabelProps> = ({
    htmlFor,
    children,
    variant = "default",
    className,
}) => {
    return (
        <label
            htmlFor={htmlFor}
            className={cn(styles.label, styles[variant], className)}
        >
            {children}
        </label>
    );
};
