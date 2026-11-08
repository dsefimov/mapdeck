import React from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./WidgetGrid.module.css";

export interface WidgetGridWrapperProps {
    /** Additional CSS class name */
    className?: string | undefined;
    /** Child content (typically WidgetGrid) */
    children: React.ReactNode;
}

export const WidgetGridWrapper: (props: WidgetGridWrapperProps) => React.ReactNode = ({
    className,
    children,
}) => <div className={cn(styles.wrapper, className)}>{children}</div>;
