import React from "react";
import { cn } from "@core/ui/utils/cn";
import { Text } from "@core/ui/components/primitives/text/Text";
import styles from "./Button.module.css";

export interface ButtonProps {
    /** Visual variant: default — bordered, primary — accent, danger — error */
    variant?: "default" | "primary" | "danger";
    size?: "sm" | "md";
    /** Stretch to the full container width */
    fullWidth?: boolean;
    disabled?: boolean;
    /** Native title (tooltip) */
    title?: string;
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
}

export const Button: (props: ButtonProps) => React.ReactNode = ({
    variant = "default",
    size = "md",
    fullWidth,
    disabled,
    title,
    children,
    onClick,
    className,
}) => {
    return (
        <button
            type="button"
            title={title}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                styles.button,
                styles[variant],
                styles[size],
                fullWidth && styles.fullWidth,
                className,
            )}
        >
            <Text variant="body" className={styles.buttonLabel}>
                {children}
            </Text>
        </button>
    );
};

export default Button;
