import React from "react";
import { observer } from "mobx-react-lite";
import type { MapToolComponentProps } from "@core/contracts";
import { useRootStore } from "@core/shell";
import { typedDict } from "@core/lib/text";
import {
    Button,
    EmptyState,
    Field,
    IconButton,
    SelectInput,
    Text,
} from "@core/ui/components";
import { ToolPanel } from "@core/ui/composites";
import { useEscapeKey, useMapCursor } from "@core/ui/hooks";
import { useOverlayLayers } from "@core/domain/map";
import {
    DEFAULT_SELECTION_COLOR,
    SELECTION_COLOR_SETTING_ID,
    ensureSelectionState,
    type SelectionMode,
} from "@core/common/selection";
import type { SelectionToolStore } from "../utils/SelectionToolStore";
import { SelectionController } from "../utils/SelectionController";
import { selectableLayers } from "../utils/selectableLayers";
import { renderDragPreview } from "../utils/dragPreview";
import type { SelectionLocaleKey } from "../locale";
import styles from "./Panel.module.css";

const MODES: ReadonlyArray<{
    mode: SelectionMode;
    labelKey: "mode.new" | "mode.add" | "mode.remove";
}> = [
    { mode: "new", labelKey: "mode.new" },
    { mode: "add", labelKey: "mode.add" },
    { mode: "remove", labelKey: "mode.remove" },
];

/** Locale key for the controller's stateStore entry — distinct from the tool id. */
const CONTROLLER_STATE_KEY = "selection:controller";

/**
 * The attribute table widget's id — a local link-by-id, not an import:
 * map tools and widgets never import each other (the view-attribute-table
 * layer tool's precedent).
 */
const ATTRIBUTE_TABLE_WIDGET_ID = "attribute-table-widget";

/** Structural slice of the widget's state the opener prepares. */
interface AttributeTableHandle {
    selectLayer(layerId: string | null): Promise<void>;
}

/**
 * The selection tool's panel: target layer, combine mode, per-layer
 * counts with zoom/clear, and the drag rectangle's preview. A thin
 * observer — interaction orchestration lives in the controller, shared
 * state in the selection store, session setup in the tool store.
 */
export const SelectionComponent: (
    props: MapToolComponentProps & { store: SelectionToolStore },
) => React.ReactNode = observer(
    ({ map, context, overlayManager, deactivate, store }) => {
        const rootStore = useRootStore();
        const dict = typedDict<SelectionLocaleKey>(
            context.locale.t("selection"),
        );
        const coreDict = context.locale.t("core");
        const selection = ensureSelectionState(context);
        const controller = context.stateStore.get(
            CONTROLLER_STATE_KEY,
            () => new SelectionController(),
        );

        React.useEffect(() => {
            controller.attach({ map, context, overlayManager, toolStore: store, selection });
            return () => controller.detach();
        }, [controller, map, context, overlayManager, store, selection]);

        useEscapeKey(deactivate);
        useMapCursor(map, "pointer");

        const color =
            context.settings.getStringSetting(SELECTION_COLOR_SETTING_ID) ??
            DEFAULT_SELECTION_COLOR;

        const previewLayers = React.useMemo(
            () => renderDragPreview(store.dragRect, map, color),
            [store.dragRect, map, color],
        );
        useOverlayLayers(overlayManager, previewLayers);

        const visibleLayers = selectableLayers(
            context.layerTree.allLayerNodes,
            context.protocols,
        );
        // The target defaults to the topmost visible layer — an unopened
        // select is one more step before the first click works.
        React.useEffect(() => {
            const first = visibleLayers.at(0);
            if (!store.targetLayerId && first) {
                store.setTargetLayer(first.id);
            }
        }, [store, visibleLayers]);

        const layerNode = (layerId: string) =>
            context.layerTree.allLayerNodes.find(
                (node) => node.id === layerId,
            );

        const layerTitle = (layerId: string): string =>
            layerNode(layerId)?.title ?? layerId;

        // Layers removed from the tree keep their selection in the store;
        // the panel lists only live nodes.
        const listedCounts = selection.layerCounts.filter(({ layerId }) =>
            Boolean(layerNode(layerId)),
        );
        const hasSelection = !selection.isEmpty && listedCounts.length > 0;

        const showUnstableHint =
            store.targetLayerId !== null &&
            selection.countFor(store.targetLayerId) > 0 &&
            !selection.hasStableIds(store.targetLayerId);

        const openInAttributeTable = (layerId: string): void => {
            rootStore.stateStore
                .peek<AttributeTableHandle>(ATTRIBUTE_TABLE_WIDGET_ID)
                ?.selectLayer(layerId);
            rootStore.widgetStore.openWidget(ATTRIBUTE_TABLE_WIDGET_ID);
        };

        return (
            <ToolPanel
                title={dict["eyebrow"]}
                hint={dict["instructions"]}
                actions={
                    <Button fullWidth onClick={deactivate}>
                        {dict["button.close"]}
                    </Button>
                }
            >
                <div className={styles.targetRow}>
                    <Field
                        label={dict["target.label"]}
                        htmlFor="selection-target-layer"
                        labelVariant="caption"
                    >
                        {visibleLayers.length > 0 ? (
                            <SelectInput
                                id="selection-target-layer"
                                value={store.targetLayerId ?? ""}
                                dict={coreDict}
                                options={visibleLayers.map((node) => ({
                                    value: node.id,
                                    label: node.title,
                                }))}
                                placeholder={dict["target.placeholder"]}
                                onChange={(value) =>
                                    store.setTargetLayer(value || null)
                                }
                            />
                        ) : (
                            <Text variant="body" tone="muted">
                                {dict["target.noLayers"]}
                            </Text>
                        )}
                    </Field>
                </div>

                <div className={styles.modeRow}>
                    {MODES.map(({ mode, labelKey }) => (
                        <Button
                            key={mode}
                            size="sm"
                            variant={
                                store.mode === mode ? "primary" : "default"
                            }
                            onClick={() => store.setMode(mode)}
                        >
                            {dict[labelKey]}
                        </Button>
                    ))}
                </div>

                {!hasSelection ? (
                    <EmptyState message={dict["list.empty"]} />
                ) : (
                    <div className={styles.layerList}>
                        {listedCounts.map(({ layerId, count }) => (
                            <div key={layerId} className={styles.layerRow}>
                                <Text
                                    variant="body"
                                    truncate
                                    className={styles.layerRow__title}
                                >
                                    {layerTitle(layerId)}
                                </Text>
                                <Text
                                    variant="body"
                                    weight="semibold"
                                    className={styles.layerRow__count}
                                >
                                    {count}
                                </Text>
                                {layerNode(layerId)?.data && (
                                    <IconButton
                                        icon="attribute-table"
                                        label={dict["action.viewInTable"]}
                                        variant="ghost"
                                        onClick={() =>
                                            openInAttributeTable(layerId)
                                        }
                                    />
                                )}
                                <IconButton
                                    icon="zoom"
                                    label={dict["action.zoom"]}
                                    variant="ghost"
                                    onClick={() => {
                                        const extent =
                                            selection.layerExtent(layerId);
                                        if (extent)
                                            controller.zoomToExtent(extent);
                                    }}
                                />
                                <IconButton
                                    icon="close"
                                    label={dict["action.clearLayer"]}
                                    variant="ghost"
                                    onClick={() => selection.clearLayer(layerId)}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {showUnstableHint && (
                    <Text variant="hint" tone="error" className={styles.unstableHint}>
                        {dict["list.unstableIds"]}
                    </Text>
                )}

                {hasSelection && (
                    <Button
                        size="sm"
                        fullWidth
                        onClick={() => selection.clearAll()}
                    >
                        {dict["button.clearAll"]}
                    </Button>
                )}
            </ToolPanel>
        );
    },
);
