import React from "react";
import { Spinner } from "@core/ui/components";
import styles from "./LoadingScreen.module.css";

export const LoadingScreen: () => React.ReactNode = () => {
    return (
        <div className={styles.container} role="status">
            <Spinner />
        </div>
    );
};
