import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import type { MediaViewerWidgetProps } from "../types";
import styles from "./Widget.module.css";

/**
 * Media viewer widget: the window chrome belongs to the widget grid; the
 * view's lifetime is tied to the window in AttributeValueStore.
 */
const MediaViewerComponent = observer<MediaViewerWidgetProps>(
    ({ widgetId, className = "" }) => {
        const { attributeValueStore, widgetStore, localeStore } =
            useRootStore();
        const view = attributeValueStore.view;

        if (!view) return null;
        const renderer = attributeValueStore.getRenderer(view.rendererId);
        if (!renderer?.renderViewer) return null;

        const close = (): void => {
            widgetStore.closeWidget(widgetId);
            attributeValueStore.closeView();
        };

        return (
            <div className={`${styles.viewer} ${className}`}>
                {/* Every open is a fresh component state (see AttributeValueView.seq). */}
                <Fragment key={view.seq}>
                    {renderer.renderViewer(view.value, {
                        close,
                        dict: localeStore.t("core"),
                    })}
                </Fragment>
            </div>
        );
    },
);

export default MediaViewerComponent;
