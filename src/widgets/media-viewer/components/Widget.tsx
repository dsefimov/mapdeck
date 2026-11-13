import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import type { MediaViewerWidgetProps } from "../types";
import styles from "./Widget.module.css";

/**
 * Media viewer widget: renders the open attribute value through its
 * renderer's `renderViewer` inside a standard grid window. The window
 * chrome (title, close, drag, resize) belongs to the widget grid; the
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
                {renderer.renderViewer(view.value, {
                    close,
                    dict: localeStore.t("core"),
                })}
            </div>
        );
    },
);

export default MediaViewerComponent;
