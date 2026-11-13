import type { ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import { Lightbox } from "@core/ui/composites";

/**
 * Workspace-level layer over the open attribute value view: the system
 * lightbox shell around the registered renderer's viewer content. Mounted
 * once next to the widget grid, above every window.
 */
export const AttributeValueViewerLayer: () => ReactNode = observer(() => {
    const { attributeValueStore, localeStore } = useRootStore();
    const view = attributeValueStore.view;
    if (!view) return null;

    const renderer = attributeValueStore.getRenderer(view.rendererId);
    if (!renderer?.renderViewer) return null;

    const dict = localeStore.t("core");

    return (
        <Lightbox
            label={renderer.describe?.(view.value, dict) ?? view.rendererId}
            closeLabel={dict["aria.close"] ?? "Close"}
            onClose={attributeValueStore.closeView}
        >
            {renderer.renderViewer(view.value, {
                close: attributeValueStore.closeView,
                dict,
            })}
        </Lightbox>
    );
});
