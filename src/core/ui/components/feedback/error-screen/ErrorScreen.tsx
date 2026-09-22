import React from "react";
import { Text } from "@core/ui/components/primitives/text/Text";
import { Button } from "@core/ui/components/primitives/button/Button";
import styles from "./ErrorScreen.module.css";

export interface ErrorScreenProps {
    message: string;
    onRetry?: (() => void) | undefined;
    dict: Record<string, string>;
    /** Locale key of the title — render failures want a softer wording. */
    titleKey?: "error.title" | "error.renderTitle";
}

export const ErrorScreen: (props: ErrorScreenProps) => React.ReactNode = ({
    message,
    onRetry,
    dict,
    titleKey = "error.title",
}) => (
    <div role="alert" className={styles.container}>
        <Text variant="title">{dict[titleKey]}</Text>
        <Text variant="body" tone="secondary" className={styles.message}>
            {message}
        </Text>
        {onRetry && (
            <Button size="sm" onClick={onRetry}>
                {dict["error.retry"]}
            </Button>
        )}
    </div>
);
