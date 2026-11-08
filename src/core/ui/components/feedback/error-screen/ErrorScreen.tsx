import type { ReactNode } from "react";
import { typedDict } from "@core/lib/text";
import { Text } from "../../primitives/text/Text";
import { Button } from "../../primitives/button/Button";
import type { Dictionary } from "../../../types";
import styles from "./ErrorScreen.module.css";

/** Keys the screen reads — the kit types exactly what it consumes. */
type ErrorScreenKey = "error.title" | "error.renderTitle" | "error.retry";

export interface ErrorScreenProps {
    message: string;
    onRetry?: (() => void) | undefined;
    dict: Dictionary;
    /** Locale key of the title — render failures want a softer wording. */
    titleKey?: "error.title" | "error.renderTitle";
}

export const ErrorScreen: (props: ErrorScreenProps) => ReactNode = ({
    message,
    onRetry,
    dict,
    titleKey = "error.title",
}) => {
    const labels = typedDict<ErrorScreenKey>(dict);
    return (
        <div role="alert" className={styles.container}>
            <Text variant="title">{labels[titleKey]}</Text>
            <Text variant="body" tone="secondary" className={styles.message}>
                {message}
            </Text>
            {onRetry && (
                <Button size="sm" onClick={onRetry}>
                    {labels["error.retry"]}
                </Button>
            )}
        </div>
    );
};
