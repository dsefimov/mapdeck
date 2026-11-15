import { type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useRootStore } from "@core/shell";
import {
    Button,
    Field,
    InlineError,
    SelectInput,
    Text,
} from "@core/ui/components";
import type { SelectOption } from "@core/ui/components";
import { DataTable } from "@core/ui/composites";
import { AttributeTableStore, PAGE_SIZE } from "../store/AttributeTableStore";
import type { AttributeLayerInfo } from "../utils/index";
import { groupLayersByTitle } from "../utils/groupLayersByTitle";
import type { AttributeTableWidgetProps } from "../types";
import styles from "./Widget.module.css";

function buildSelectOptions(layers: AttributeLayerInfo[]): SelectOption[] {
    const { groups, ungrouped } = groupLayersByTitle(layers);
    return [
        ...Array.from(groups.entries()).flatMap(([groupTitle, groupLayers]) =>
            groupLayers.map((layer) => ({
                value: layer.id,
                label: layer.title,
                group: groupTitle,
            })),
        ),
        ...ungrouped.map((layer) => ({
            value: layer.id,
            label: layer.title,
        })),
    ];
}

interface LayerSelectProps {
    readonly widgetId: string;
    readonly layers: AttributeLayerInfo[];
    readonly selectedLayerId: string | null;
    readonly dict: Record<string, string | undefined>;
    readonly coreDict: Record<string, string>;
    readonly onSelect: (layerId: string | null) => void;
}

function LayerSelect({
    widgetId,
    layers,
    selectedLayerId,
    dict,
    coreDict,
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
            dict={coreDict}
            options={selectOptions}
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
        // A tracked read of the shared selection: any change (from the
        // map tool or this table) re-renders the rows — the checkbox
        // column's isSelected closures live outside this observer.
        const selectedCount = store.selectedRowIds.size;

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
                            coreDict={coreDict}
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
                        {...(store.selectionColumn && {
                            selection: store.selectionColumn,
                        })}
                        controls={
                            store.selectedLayerId ? (
                                <Button
                                    size="sm"
                                    disabled={selectedCount === 0}
                                    variant={
                                        store.selectionPinnedToTop
                                            ? "primary"
                                            : "default"
                                    }
                                    onClick={store.toggleSelectionPinnedToTop}
                                >
                                    {dict["selection.pinToTop"]}
                                </Button>
                            ) : undefined
                        }
                        valueRenderers={rootStore.attributeValueStore.renderersList}
                        onOpenValue={rootStore.attributeValueStore.openView}
                        dict={coreDict}
                        />
                    </div>
                )}
            </div>
        );
    },
);

export default AttributeTableWidget;
