import React from "react";
import { cn } from "@core/ui/utils/cn";
import styles from "./Spinner.module.css";

export interface SpinnerProps {
    className?: string | undefined;
    /** "md" (default) — 24px, "sm" — 16px */
    size?: "sm" | "md";
}

export const Spinner: (props: SpinnerProps) => React.ReactNode = ({ className, size = "md" }) => {
    return <div className={cn(styles.spinner, styles[size], className)} />;
};

export default Spinner;
