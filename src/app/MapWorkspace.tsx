import { observer } from "mobx-react-lite";
import type { ReactNode } from "react";
import { useRootStore } from "@core/shell";
import { WidgetGrid, WidgetGridWrapper } from "@core/ui/composites";
import { LOCALE_KEY_WIDGET_NAME } from "@core/contracts";
import type { WidgetInstance } from "@core/common/widget";
import { SIDEBAR_ID } from "@widgets/sidebar";
import { MAP_VIEWER_ID } from "@widgets/map-viewer";
import styles from "./MapWorkspace.module.css";

/** A widget placed over the map instead of the grid (tool panels). */
function isMapToolbarWidget(widget: WidgetInstance): boolean {
    return (widget.definition.placement ?? "grid") === "map-toolbar";
}

interface WidgetSlotProps {
    readonly widget: WidgetInstance | undefined;
    readonly widgetId: string;
    readonly className?: string | undefined;
}

/** Renders a registered widget's component in place, or nothing. */
function WidgetSlot({
    widget,
    widgetId,
    className,
}: WidgetSlotProps): ReactNode {
    if (!widget) return null;
    const Widget = widget.definition.component;
    return <Widget widgetId={widgetId} className={className ?? ""} />;
}

/**
 * The static workspace chrome (ADR-0004): the sidebar and the map viewer
 * sit outside the widget grid, map-tool panels render over the map, and
 * the floating widget grid fills the rest.
 */
const MapWorkspace: () => ReactNode = observer(() => {
    const { widgetStore, localeStore } = useRootStore();

    const sidebar = widgetStore.getWidgetById(SIDEBAR_ID);
    const map = widgetStore.getWidgetById(MAP_VIEWER_ID);
    const toolbarPanels = widgetStore.allWidgets.filter(isMapToolbarWidget);

    return (
        <div className={styles.mapWorkspace}>
            <WidgetSlot widget={sidebar} widgetId={SIDEBAR_ID} />

            {map ? (
                <div className={styles.mapArea}>
                    <WidgetSlot widget={map} widgetId={MAP_VIEWER_ID} />

                    {toolbarPanels.map((panel) => (
                        <WidgetSlot
                            key={panel.id}
                            widget={panel}
                            widgetId={panel.id}
                            className={styles.mapToolbarWidget}
                        />
                    ))}

                    <WidgetGridWrapper>
                        <WidgetGrid
                            store={widgetStore}
                            dict={localeStore.t("core")}
                            getWidgetName={(id) =>
                                localeStore.t(id)[LOCALE_KEY_WIDGET_NAME] ??
                                id
                            }
                        />
                    </WidgetGridWrapper>
                </div>
            ) : null}
        </div>
    );
});

export default MapWorkspace;
