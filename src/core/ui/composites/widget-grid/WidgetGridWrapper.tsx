import React from "react";
import styles from "./WidgetGrid.module.css";

export interface WidgetGridWrapperProps {
    /** Additional CSS class name */
    className?: string;
    /** Child content (typically WidgetGrid) */
    children: React.ReactNode;
}

const WidgetGridWrapper: (props: WidgetGridWrapperProps) => React.ReactNode = ({
    className = "",
    children,
}) => <div className={`${styles.wrapper} ${className}`.trim()}>{children}</div>;

export default WidgetGridWrapper;
