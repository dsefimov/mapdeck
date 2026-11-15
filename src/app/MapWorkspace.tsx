import { observer } from "mobx-react-lite";
import type { ReactNode } from "react";
import { useRootStore } from "@core/shell";
import { WidgetGrid, WidgetGridWrapper } from "@core/ui/composites";
import { LOCALE_KEY_WIDGET_NAME } from "@core/contracts";
import type { WidgetInstance } from "@core/common/widget";
import { SIDEBAR_ID } from "@widgets/sidebar";
import { MAP_VIEWER_ID } from "@widgets/map-viewer";
import styles from "./MapWorkspace.module.css";

function isMapToolbarWidget(widget: WidgetInstance): boolean {
    return (widget.definition.placement ?? "grid") === "map-toolbar";
}

interface WidgetSlotProps {
    readonly widget: WidgetInstance | undefined;
    readonly widgetId: string;
    readonly className?: string | undefined;
}

function WidgetSlot({
    widget,
    widgetId,
    className,
}: WidgetSlotProps): ReactNode {
    if (!widget) return null;
    const Widget = widget.definition.component;
    return <Widget widgetId={widgetId} className={className ?? ""} />;
}

const MapWorkspace: () => ReactNode = observer(() => {
    const { widgetStore, localeStore } = useRootStore();

    const sidebar = widgetStore.getWidgetById(SIDEBAR_ID);
    const map = widgetStore.getWidgetById(MAP_VIEWER_ID);
    const toolbarPanels = widgetStore.allWidgets.filter(isMapToolbarWidget);

    // The kit reads no observables (mobx-free by design), so this observer
    // must touch every field the grid renders — otherwise tracking hangs on
    // the store getters' incidental reads and e.g. a z-order bump never
    // re-renders.
    const gridWidgets = widgetStore.openWidgets.map((widget) => ({
        id: widget.id,
        zIndex: widget.zIndex,
        layout: widget.layout,
        definition: widget.definition,
    }));

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
                            widgets={gridWidgets}
                            layout={widgetStore.layoutItems}
                            gridConfig={widgetStore.gridConfig}
                            onUpdateLayout={(id, item) =>
                                widgetStore.updateLayout(id, item)
                            }
                            onSyncLayout={(items) =>
                                widgetStore.syncLayout(items)
                            }
                            onCloseWidget={(id) => widgetStore.closeWidget(id)}
                            onFocusWidget={(id) =>
                                widgetStore.bringToFront(id)
                            }
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
