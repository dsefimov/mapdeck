import React from "react";
import { Text } from "@core/ui/components/primitives/text/Text";
import { IconButton } from "@core/ui/components/primitives/icon-button/IconButton";
import { typedDict } from "@core/lib/text";
import styles from "./InlineError.module.css";

export interface InlineErrorProps {
    message: string;
    onRetry?: () => void;
    dict: Record<string, string>;
}

export const InlineError: (props: InlineErrorProps) => React.ReactNode = ({
    message,
    onRetry,
    dict,
}) => {
    // The kit cannot name the core dictionary's key union (`ui → lib`
    // layer rule), so it types exactly the keys it consumes.
    const labels = typedDict<"error.retry">(dict);
    return (
        <div className={styles.container} role="alert">
            <Text variant="hint" tone="error" className={styles.message}>
                {message}
            </Text>
            {onRetry && (
                <IconButton
                    icon="refresh"
                    label={labels["error.retry"]}
                    onClick={onRetry}
                    className={styles.retry}
                />
            )}
        </div>
    );
};
