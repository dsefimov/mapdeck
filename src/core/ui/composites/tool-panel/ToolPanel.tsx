import React, { type ReactNode } from "react";
import { WidgetShell } from "@core/ui/composites/widget-shell/WidgetShell";
import styles from "./ToolPanel.module.css";

export interface ToolPanelProps {
    /** Title shown at the top (e.g. "Feature Info" / "3D Ruler") */
    title: ReactNode;
    /** Keyboard shortcuts / help text at the bottom */
    hint?: ReactNode;
    /** Action buttons rendered in an actions row */
    actions?: ReactNode;
    /** Tool-specific content */
    children?: ReactNode;
    className?: string;
}

/**
 * Generic panel chrome for map tools — inherits WidgetShell
 * (14px bold title, padding/gap 10, radius 6), adds a
 * fixed width for the tool panel.
 *
 * Renders title → children → actions → hint
 * in a fixed visual structure.
 */
export const ToolPanel: (props: ToolPanelProps) => React.ReactNode = ({
    title,
    hint,
    actions,
    children,
    className,
}) => {
    const panelClass = [styles.panel, className].filter(Boolean).join(" ");

    return (
        <WidgetShell
            title={title}
            hint={hint}
            actions={actions}
            className={panelClass}
        >
            {children}
        </WidgetShell>
    );
};

export default ToolPanel;
