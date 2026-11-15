import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import styles from "./WidgetGrid.module.css";

export interface WidgetGridWrapperProps {
    /** Additional CSS class name */
    className?: string | undefined;
    /** Child content (typically WidgetGrid) */
    children: ReactNode;
}

export const WidgetGridWrapper: (props: WidgetGridWrapperProps) => ReactNode = ({
    className,
    children,
}) => <div className={cn(styles.wrapper, className)}>{children}</div>;
