import React, { type ReactNode } from "react";
import { IconButton } from "@core/ui/components/primitives/icon-button/IconButton";
import { Text } from "@core/ui/components/primitives/text/Text";
import styles from "./WidgetShell.module.css";

export interface WidgetShellProps {
    title: ReactNode;
    /** Close button on the right of the header */
    onClose?: () => void;
    /** Accessible label for the close button */
    closeLabel?: string;
    /** Action row at the bottom (full-width buttons) */
    actions?: ReactNode;
    /** Hint at the very bottom */
    hint?: ReactNode;
    children?: ReactNode;
    className?: string;
}

const DEFAULT_CLOSE_LABEL = "Close";

/**
 * Design-system widget shell: header with title and close button,
 * content, optional actions row and bottom hint.
 */
export const WidgetShell: (props: WidgetShellProps) => React.ReactNode = ({
    title,
    onClose,
    closeLabel = DEFAULT_CLOSE_LABEL,
    actions,
    hint,
    children,
    className,
}) => {
    const panelClass = [styles.panel, className].filter(Boolean).join(" ");

    return (
        <div className={panelClass}>
            <div className={styles.header}>
                <Text variant="title">{title}</Text>
                {onClose && (
                    <IconButton
                        icon="close"
                        label={closeLabel}
                        onClick={onClose}
                    />
                )}
            </div>
            {children}
            {actions && <div className={styles.actions}>{actions}</div>}
            {hint && <Text variant="hint">{hint}</Text>}
        </div>
    );
};

export default WidgetShell;
