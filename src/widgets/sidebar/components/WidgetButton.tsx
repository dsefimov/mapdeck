import { type StoredWidget, LOCALE_KEY_WIDGET_NAME } from "@core/contracts";
import { formatDict, typedDict } from "@core/lib/text";
import { useRootStore } from "@core/shell";
import { observer } from "mobx-react-lite";
import type { SidebarLocaleKey } from "../locale";
import { SIDEBAR_ID } from "..";
import styles from "./Widget.module.css";

interface WidgetButtonProps {
    widget: StoredWidget;
    isOpen: boolean;
    onClick: (widgetId: string) => void;
}

const WidgetButton = observer<WidgetButtonProps>(
    ({ widget, isOpen, onClick }) => {
        const rootStore = useRootStore();
        const dict = typedDict<SidebarLocaleKey>(
            rootStore.localeStore.t(SIDEBAR_ID),
        );
        const widgetButtonClass = `${styles.sidebar__widgetButton} ${
            isOpen ? styles.sidebar__widgetButtonOpen : ""
        }`;

        // Dynamic namespace — no key union is possible, so the id is the
        // display-name fallback (same idiom as getWidgetName).
        const widgetName =
            rootStore.localeStore.t(widget.id)[LOCALE_KEY_WIDGET_NAME] ??
            widget.id;

        const handleClick = () => onClick(widget.id);

        return (
            <button
                className={widgetButtonClass}
                onClick={handleClick}
                title={widgetName}
                aria-label={formatDict(dict["aria.selectWidget"], {
                    name: widgetName,
                })}
            >
                <div className={styles.sidebar__widgetIcon}>
                    {widget.icon ? (
                        <img src={widget.icon} alt="" aria-hidden="true" />
                    ) : (
                        <div className={styles.sidebar__iconPlaceholder} />
                    )}
                </div>
            </button>
        );
    },
);

export default WidgetButton;
