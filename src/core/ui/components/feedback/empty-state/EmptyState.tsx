import React from "react";
import { Button } from "@core/ui/components/primitives/button/Button";
import { Text } from "@core/ui/components/primitives/text/Text";
import { cn } from "@core/ui/utils/cn";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
    /** Primary centered message (empty result or loading placeholder). */
    message: React.ReactNode;
    /** Optional single action, e.g. a retry. */
    action?: {
        label: string;
        onClick: () => void;
    };
    className?: string | undefined;
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
    <div role="status" className={cn(styles.container, className)}>
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

