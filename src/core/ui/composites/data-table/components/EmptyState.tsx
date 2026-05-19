import React from "react";
import { Icon } from "@core/ui/components";
import type { TranslationDict } from "@core/framework/types";
import styles from "../AttributeTable.module.css";

interface EmptyStateProps {
    header?: string | undefined;
    onRefresh?: (() => void) | (() => Promise<void>) | undefined;
    dict: TranslationDict;
}

export const EmptyState: React.FC<EmptyStateProps> = React.memo(
    ({ header, onRefresh, dict }) => (
        <>
            {header && <div className={styles.header}>{header}</div>}
            <div className={styles.emptyState}>
                <span>{dict["attributeTable.noData"]}</span>
                {onRefresh && (
                    <button
                        type="button"
                        className={styles.retryButton}
                        onClick={onRefresh}
                        title={dict["attributeTable.retry"]}
                        aria-label={dict["attributeTable.retry"]}
                    >
                        <Icon name="refresh" />
                    </button>
                )}
            </div>
        </>
    ),
);
EmptyState.displayName = "EmptyState";
