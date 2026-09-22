import React from "react";
import { Button } from "@core/ui/components/primitives/button/Button";
import { Text } from "@core/ui/components/primitives/text/Text";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
    /** Primary centered message (empty result or loading placeholder). */
    message: React.ReactNode;
    /** Optional single action, e.g. a retry. */
    action?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
}

/**
 * Centered placeholder for empty or loading content.
 * Announced to screen readers via `role="status"`.
 */
export const EmptyState: (props: EmptyStateProps) => React.ReactNode = ({
    message,
    action,
    className,
}) => (
    <div
        role="status"
        className={[styles.container, className].filter(Boolean).join(" ")}
    >
        <Text variant="body" tone="secondary" className={styles.message}>
            {message}
        </Text>
        {action && (
            <Button size="sm" onClick={action.onClick}>
                {action.label}
            </Button>
        )}
    </div>
);

export default EmptyState;
