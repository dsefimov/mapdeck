import type { ReactNode } from "react";
import { Spinner } from "../../primitives/spinner/Spinner";
import styles from "./LoadingScreen.module.css";

export const LoadingScreen: () => ReactNode = () => {
    return (
        <div className={styles.container} role="status">
            <Spinner />
        </div>
    );
};
