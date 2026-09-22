import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "@core/lib/logger";
import { ErrorScreen } from "../error-screen/ErrorScreen";

interface ErrorBoundaryProps {
    children: ReactNode;
    /** Locale dictionary carrying error.renderTitle / error.retry. */
    dict: Record<string, string>;
    /** Replaces the default recovery — a remount of the children. */
    onRetry?: () => void;
}

interface ErrorBoundaryState {
    error: Error | null;
    /** Bumped on retry — the children remount with fresh internal state. */
    nonce: number;
}

/**
 * Contains a render failure to its subtree: a crashing widget degrades to
 * an error card instead of unmounting the whole workspace. Recovery is a
 * remount of the subtree (or a caller-supplied reset) — not a page reload.
 */
export class ErrorBoundary extends Component<
    ErrorBoundaryProps,
    ErrorBoundaryState
> {
    override state: ErrorBoundaryState = { error: null, nonce: 0 };

    static getDerivedStateFromError(
        error: Error,
    ): Partial<ErrorBoundaryState> {
        return { error };
    }

    override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
        // The component tree path is the only way to tell which subtree
        // crashed — the JS stack alone is minified in production.
        logger.error("Render error contained:", error, errorInfo.componentStack);
    }

    private readonly _retry = (): void => {
        this.setState((state) => ({ error: null, nonce: state.nonce + 1 }));
    };

    override render(): ReactNode {
        const { error, nonce } = this.state;
        if (error) {
            return (
                <ErrorScreen
                    message={error.message}
                    dict={this.props.dict}
                    titleKey="error.renderTitle"
                    onRetry={this.props.onRetry ?? this._retry}
                />
            );
        }
        return <React.Fragment key={nonce}>{this.props.children}</React.Fragment>;
    }
}
