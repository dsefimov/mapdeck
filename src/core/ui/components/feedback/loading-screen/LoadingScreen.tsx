import type { ReactNode } from "react";
import { Spinner } from "../../primitives/spinner/Spinner";
import styles from "./LoadingScreen.module.css";

export interface LoadingScreenProps {
    /** Accessible name of the status region (announced by screen readers). */
    label?: string | undefined;
}

export const LoadingScreen: (props: LoadingScreenProps) => ReactNode = ({
    label,
}) => {
    return (
        <div className={styles.container} role="status" aria-label={label}>
            <Spinner />
        </div>
    );
};
