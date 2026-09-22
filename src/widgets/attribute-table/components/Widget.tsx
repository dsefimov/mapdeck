import { type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import { Field, InlineError, SelectInput, Text } from "@core/ui/components";
import type { SelectGroup, SelectOption } from "@core/ui/components";
import { DataTable } from "@core/ui/composites";
import { AttributeTableStore, PAGE_SIZE } from "../store/AttributeTableStore";
import type { AttributeLayerInfo } from "../utils/index";
import { groupLayersByTitle } from "../utils/groupLayersByTitle";
import type { AttributeTableWidgetProps } from "../types";
import styles from "./Widget.module.css";

function getSelectedLayerTitle(
    selectedLayerId: string | null,
    layers: AttributeLayerInfo[],
): string | undefined {
    if (!selectedLayerId) return undefined;
    return layers.find((l) => l.id === selectedLayerId)?.title;
}

/** Flat/grouped select options built from the layer list. */
function buildSelectOptions(layers: AttributeLayerInfo[]): {
    groups: SelectGroup[];
    options: SelectOption[];
} {
    const { groups, ungrouped } = groupLayersByTitle(layers);
    return {
        groups: Array.from(groups.entries()).map(([groupTitle, groupLayers]) => ({
            label: groupTitle,
            options: groupLayers.map((layer) => ({
                value: layer.id,
                label: layer.title,
            })),
        })),
        options: ungrouped.map((layer) => ({
            value: layer.id,
            label: layer.title,
        })),
    };
}

interface LayerSelectProps {
    readonly widgetId: string;
    readonly layers: AttributeLayerInfo[];
    readonly selectedLayerId: string | null;
    readonly dict: Record<string, string | undefined>;
    readonly onSelect: (layerId: string | null) => void;
}

/** Layer picker (SelectInput with groups instead of a native select/optgroup). */
function LayerSelect({
    widgetId,
    layers,
    selectedLayerId,
    dict,
    onSelect,
}: LayerSelectProps): ReactNode {
    const selectOptions = buildSelectOptions(layers);
    const hasLayers = layers.length > 0;

    if (!hasLayers) {
        return <Text variant="body">{dict["empty.noLayers"]}</Text>;
    }

    return (
        <SelectInput
            id={`${widgetId}-layer-select`}
            value={selectedLayerId ?? ""}
            groups={selectOptions.groups}
            options={selectOptions.options}
            {...(dict["layerSelector.placeholder"] && {
                placeholder: dict["layerSelector.placeholder"],
            })}
            {...(dict["aria.layerSelect"] && {
                ariaLabel: dict["aria.layerSelect"],
            })}
            onChange={(value) => onSelect(value || null)}
        />
    );
}

/**
 * Attribute Table Widget.
 * Displays a dropdown to select WFS layers and shows their feature data
 * with lazy loading, sorting, and filtering support.
 */
const AttributeTableWidget = observer<AttributeTableWidgetProps>(
    ({ widgetId, className = "" }) => {
        const rootStore = useRootStore();
        const dict = rootStore.localeStore.t(widgetId);
        const coreDict = rootStore.localeStore.t("core");

        // The store persists across widget close/open cycles.
        const store = rootStore.stateStore.get(
            widgetId,
            () =>
                new AttributeTableStore(rootStore, {
                    maxFeaturesPerRequest: 1000,
                }),
        );

        const attributeLayers = store.attributeLayers;
        const selectedLayerTitle = getSelectedLayerTitle(
            store.selectedLayerId,
            attributeLayers,
        );

        return (
            <div className={`${styles.widget} ${className}`}>
                <div className={styles.layerSelector}>
                    <Field
                        label={dict["layerSelector.label"]}
                        htmlFor={`${widgetId}-layer-select`}
                        labelVariant="caption"
                    >
                        <LayerSelect
                            widgetId={widgetId}
                            layers={attributeLayers}
                            selectedLayerId={store.selectedLayerId}
                            dict={dict}
                            onSelect={(layerId) => store.selectLayer(layerId)}
                        />
                    </Field>
                </div>

                {store.error && (
                    <InlineError
                        message={store.error}
                        onRetry={store.refreshData}
                        dict={coreDict}
                    />
                )}

                {store.selectedLayerId && (
                    <div className={styles.tableArea}>
                        <DataTable
                            rows={store.loadedFeatures}
                            {...(store.columns.length > 0 && {
                                columns: store.columns,
                            })}
                            {...(selectedLayerTitle && {
                                header: selectedLayerTitle,
                            })}
                            totalRows={store.totalFeatures}
                            loading={store.isBusy}
                            fetchMore={store.loadNextPage}
                            pageSize={PAGE_SIZE}
                            sortColumn={store.sortColumn}
                            sortDirection={store.sortDirection}
                            onSort={store.setSort}
                            onRefresh={store.refreshData}
                            {...(store.geometryColumn && {
                                geometryColumn: store.geometryColumn,
                            })}
                            dict={coreDict}
                        />
                    </div>
                )}
            </div>
        );
    },
);

export default AttributeTableWidget;
