import { observer } from "mobx-react-lite";

import { useRootStore } from "@core/shell";

import WidgetButton from "./WidgetButton";
import { filterSidebarWidgets } from "../utils/filterSidebarWidgets";
import type { SidebarProps } from "../types";
import styles from "./Widget.module.css";

const SidebarComponent = observer(
    ({ excludedWidgetIds = [] }: SidebarProps) => {
        const rootStore = useRootStore();
        const { widgetStore } = rootStore;

        const widgets = filterSidebarWidgets(
            widgetStore.allWidgets,
            excludedWidgetIds,
        );

        const handleWidgetClick = (widgetId: string) => {
            if (widgetStore.isWidgetOpen(widgetId)) {
                widgetStore.closeWidget(widgetId);
            } else {
                widgetStore.openWidget(widgetId);
            }
        };

        return (
            <div className={`${styles.sidebar} ${styles.sidebarCollapsed}`}>
                <div className={styles.sidebar__widgetsList}>
                    {widgets.map((instance) => (
                        <WidgetButton
                            key={instance.id}
                            widget={instance.definition}
                            isOpen={instance.isOpen}
                            onClick={handleWidgetClick}
                        />
                    ))}
                </div>
            </div>
        );
    },
);

export default SidebarComponent;
