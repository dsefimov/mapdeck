import React from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./Text.module.css";

export type TextVariant = "title" | "body" | "hint" | "caption";
export type TextTone = "secondary" | "muted" | "accent" | "error";
export type TextWeight = "semibold" | "bold";

export interface TextProps {
    /** Typographic variant: title — headings (xl/bold), body — base text
        (base/regular), hint — notes (xs/regular), caption — uppercase label
        (xs/semibold/uppercase). */
    variant?: TextVariant;
    /** Color override for semantic exceptions. */
    tone?: TextTone | undefined;
    /** Weight override. */
    weight?: TextWeight | undefined;
    /** Truncate long text with an ellipsis (nowrap + overflow + ellipsis). */
    truncate?: boolean;
    /** Remove the text from the accessibility tree (visual-only labels). */
    ariaHidden?: boolean;
    children: React.ReactNode;
    className?: string | undefined;
}

/**
 * Design-system text. Single element for all text in src: typography tokens
 * are consumed here, consumers keep only layout.
 */
export const Text: (props: TextProps) => React.ReactNode = ({
    variant = "body",
    tone,
    weight,
    truncate,
    ariaHidden,
    children,
    className,
}) => (
    <span
        className={cn(
            styles.text,
            styles[variant],
            tone && styles[tone],
            weight && styles[weight],
            truncate && styles.truncate,
            className,
        )}
        aria-hidden={ariaHidden || undefined}
    >
        {children}
    </span>
);

export default Text;
