import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "@core/lib/logger";
import type { StoreRegistry } from "@core/store-registry";
import { ErrorScreen } from "@core/ui/components";
import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
    children: ReactNode;
    rootStore: StoreRegistry;
}

interface ErrorBoundaryState {
    error: Error | null;
}

/**
 * Catches render-time errors in the workspace so a crashing widget
 * cannot unmount the whole application. Recovery is a full reload —
 * render state is unreliable after an uncaught exception.
 */
export class ErrorBoundary extends Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    override state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // The component tree path is the only way to tell which widget
        // crashed — the JS stack alone is minified in production.
        logger.error(
            "Unhandled render error:",
            error,
            errorInfo.componentStack,
        );
    }

    override render(): ReactNode {
        if (this.state.error) {
            const dict = this.props.rootStore.localeStore.t("core");
            return (
                <div className={styles.container}>
                    <ErrorScreen
                        message={this.state.error.message}
                        dict={dict}
                        titleKey="error.renderTitle"
                        onRetry={() => window.location.reload()}
                    />
                </div>
            );
        }

        return <>{this.props.children}</>;
    }
}
