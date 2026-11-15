import React from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import { Icon, Text } from "@core/ui/components";
import { isLayerNode } from "@core/contracts";
import { logger } from "@core/lib/logger";
import { VIEW_ATTRIBUTE_TABLE_ID, ATTRIBUTE_TABLE_WIDGET_ID } from "./Tool";
import styles from "./Panel.module.css";

export interface ViewAttributeTableButtonProps {
    nodeId: string;
}

/** Structural slice of the widget's state the opener prepares. */
interface AttributeTableHandle {
    selectLayer(layerId: string | null): Promise<void>;
}

export const ViewAttributeTableComponent: (
    props: ViewAttributeTableButtonProps,
) => React.ReactNode = observer(({ nodeId }) => {
    const rootStore = useRootStore();
    const dict = rootStore.localeStore.t(VIEW_ATTRIBUTE_TABLE_ID);
    const node = rootStore.treeStore.node(nodeId);

    if (!node || !isLayerNode(node)) {
        logger.warn(`ViewAttributeTableButton: node ${nodeId} is not a layer`);
        return null;
    }

    if (!node.data) {
        return null;
    }

    const handleClick = () => {
        rootStore.stateStore
            .peek<AttributeTableHandle>(ATTRIBUTE_TABLE_WIDGET_ID)
            ?.selectLayer(nodeId);

        rootStore.widgetStore.openWidget(ATTRIBUTE_TABLE_WIDGET_ID);

    };

    return (
        <button
            type="button"
            className={styles.button}
            onClick={handleClick}
            aria-label={dict["aria.button"]}
        >
            <Icon name="attribute-table" className={styles.icon ?? ""} />
            <Text variant="body" truncate className={styles.label}>
                {dict["label.button"]}
            </Text>
        </button>
    );
});

export default ViewAttributeTableComponent;
