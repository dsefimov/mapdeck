import type { ReactNode } from "react";
import { cn } from "../../../utils/cn";
import { Text } from "../text/Text";
import styles from "./InputLabel.module.css";

export interface InputLabelProps {
    /** Maps to native `for` attribute, associates label with an input */
    htmlFor: string;
    /** Label content (text, formatted messages, etc.) */
    children: ReactNode;
    /** `Text` variant of the label content */
    variant?: "body" | "caption" | undefined;
    className?: string | undefined;
}

export const InputLabel: (props: InputLabelProps) => ReactNode = ({
    htmlFor,
    children,
    variant = "body",
    className,
}) => (
    <label htmlFor={htmlFor} className={cn(styles.label, className)}>
        <Text variant={variant}>{children}</Text>
    </label>
);
