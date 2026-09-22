import React from "react";
import { observer } from "mobx-react-lite";
import { IconButton, SearchInput } from "@core/ui/components";
import { useRootStore } from "@core/shell";
import { LayerTreeViewModel } from "../viewModel/LayerTreeViewModel";
import { LAYER_TREE_ID } from "..";
import styles from "./Widget.module.css";

interface LayerTreeHeaderProps {
    onUpdateClick?: () => void;
    disabled?: boolean;
}

const LayerTreeHeader: (props: LayerTreeHeaderProps) => React.ReactNode =
    observer(({ onUpdateClick, disabled = true }) => {
        const rootStore = useRootStore();
        const dict = rootStore.localeStore.t(LAYER_TREE_ID);
        const viewModel = rootStore.stateStore.get(
            LAYER_TREE_ID,
            () => new LayerTreeViewModel(rootStore),
        );

        return (
            <div className={styles.layerTree__header}>
                <SearchInput
                    id="layer-tree-search"
                    value={viewModel.searchQuery}
                    onChange={(value) => viewModel.setSearchQuery(value)}
                    disabled={disabled}
                    {...(styles.layerTree__search && {
                        className: styles.layerTree__search,
                    })}
                    {...(dict["search.placeholder"] && {
                        placeholder: dict["search.placeholder"],
                    })}
                    {...(dict["aria.search"] && {
                        ariaLabel: dict["aria.search"],
                    })}
                />
                {onUpdateClick && (
                    <IconButton
                        icon="refresh"
                        label={dict["button.update.title"] ?? "Update"}
                        onClick={onUpdateClick}
                        {...(styles.layerTree__updateButton && {
                            className: styles.layerTree__updateButton,
                        })}
                    />
                )}
            </div>
        );
    });

export default LayerTreeHeader;
