import React from "react";
import { observer } from "mobx-react-lite";
import { reaction } from "mobx";
import maplibregl from "maplibre-gl";
import { logger } from "@core/shared/diagnostics/logger";

import type { MapToolComponentProps, LayerNode } from "@core/framework/types";

import type { FeatureGroup, CollectResult, ClickPosition } from "../types";
import { featureCollector } from "../utils/FeatureCollector";
import { showClickMarker, removeClickMarker } from "../utils/clickMarker";
import { DataTable } from "@core/ui/composites/data-table";
import { LoadingScreen } from "@core/ui/components";
import { ToolPanel } from "@core/ui/composites";
import toolStyles from "@core/ui/composites/tool-panel/ToolPanel.module.css";
import styles from "./Panel.module.css";

/**
 * Main FeatureInfo component.
 * Handles map click events, collects features from all providers,
 * and displays them in a dropdown + attribute table UI.
 */
export const FeatureInfoComponent: (
    props: MapToolComponentProps,
) => React.ReactNode = observer(
    ({ map, rootStore, deactivate, overlayManager }) => {
        const dict = rootStore.localeStore.t("feature-info");
        const coreDict = rootStore.localeStore.t("core");
        const [groups, setGroups] = React.useState<FeatureGroup[]>([]);
        const [selectedIndex, setSelectedIndex] = React.useState(0);
        const [loading, setLoading] = React.useState(false);
        const [hasClicked, setHasClicked] = React.useState(false);
        const abortRef = React.useRef<AbortController | null>(null);

        /**
         * Get visible layer nodes from LayerTreeStore.
         */
        const getVisibleLayers = React.useCallback((): LayerNode[] => {
            return rootStore.treeStore.layerNodes.filter(
                (node) => node.isVisible,
            );
        }, [rootStore.treeStore]);

        const triggerCollection = React.useCallback(
            (
                lngLat: maplibregl.LngLat,
                screenPoint: { x: number; y: number },
            ) => {
                if (abortRef.current) abortRef.current.abort();

                const position: ClickPosition = {
                    lng: lngLat.lng,
                    lat: lngLat.lat,
                };
                showClickMarker(position, overlayManager);
                setHasClicked(true);
                setSelectedIndex(0);
                setLoading(true);

                const visibleLayers = getVisibleLayers();

                const controller = new AbortController();
                abortRef.current = controller;

                featureCollector
                    .collect(
                        {
                            screenX: screenPoint.x,
                            screenY: screenPoint.y,
                            map,
                            visibleLayers,
                            signal: controller.signal,
                            xyzNotAvailableMessage:
                                dict["provider.xyzNotAvailable"] ?? "",
                            cogNotAvailableMessage:
                                dict["provider.cogNotAvailable"] ?? "",
                        },
                        (result: CollectResult) => {
                            if (controller.signal.aborted) return;

                            setGroups(result.groups);
                            setLoading(result.loading);

                            setSelectedIndex((prev) =>
                                result.groups.length <= prev ? 0 : prev,
                            );
                        },
                    )
                    .catch((error) => {
                        if (!controller.signal.aborted) {
                            logger.error(
                                "FeatureInfo: collection failed",
                                error,
                            );
                            setLoading(false);
                        }
                    });
            },
            [dict, getVisibleLayers, map, overlayManager],
        );

        const triggerCollectionRef = React.useRef(triggerCollection);
        triggerCollectionRef.current = triggerCollection;

        const handleMapClick = React.useCallback(
            (event: maplibregl.MapMouseEvent) => {
                triggerCollection(event.lngLat, {
                    x: event.point.x,
                    y: event.point.y,
                });
            },
            [triggerCollection],
        );

        /**
         * Handle Escape key to deactivate.
         */
        const handleKeyDown = React.useCallback(
            (event: KeyboardEvent) => {
                if (event.key === "Escape") {
                    deactivate();
                }
            },
            [deactivate],
        );

        // Subscribe to map events
        React.useEffect(() => {
            map.on("click", handleMapClick);
            window.addEventListener("keydown", handleKeyDown);

            return () => {
                map.off("click", handleMapClick);
                window.removeEventListener("keydown", handleKeyDown);
                removeClickMarker(overlayManager);
            };
        }, [handleMapClick, handleKeyDown, map, overlayManager]);

        // Update cursor
        React.useEffect(() => {
            const canvas = map.getCanvas();
            if (!canvas) return;

            canvas.style.cursor = "crosshair";

            return () => {
                canvas.style.cursor = "";
            };
        }, [map]);

        React.useEffect(() => {
            return reaction(
                () => rootStore.mapToolStore.pendingPoint,
                (pending) => {
                    if (!pending) return;
                    const point = rootStore.mapToolStore.consumePendingPoint();
                    if (!point) return;

                    triggerCollectionRef.current(
                        new maplibregl.LngLat(
                            point.lngLat.lng,
                            point.lngLat.lat,
                        ),
                        point.screenPoint,
                    );
                },
                { fireImmediately: true },
            );
        }, [rootStore.mapToolStore]);

        // Render
        const selectedGroup = groups[selectedIndex];
        const totalGroups = groups.length;

        return (
            <ToolPanel
                title={dict["eyebrow"]}
                hint={dict["instructions"]}
                actions={
                    <button
                        type="button"
                        className={toolStyles.button}
                        onClick={deactivate}
                    >
                        {dict["button.close"]}
                    </button>
                }
            >
                {!hasClicked && (
                    <div className={styles.noFeatures}>
                        {dict["noClickYet"]}
                    </div>
                )}

                {hasClicked && groups.length === 0 && !loading && (
                    <div className={styles.noFeatures}>
                        {dict["noFeatures"]}
                    </div>
                )}

                {loading && <LoadingScreen />}

                {/* Layer selector — always visible, shows only layers with features */}
                <div className={styles.layerSelector}>
                    <label className={styles.layerSelectorLabel}>
                        {dict["layer.label"]}
                    </label>
                    <select
                        className={styles.layerSelect}
                        value={selectedIndex}
                        onChange={(e) =>
                            setSelectedIndex(Number(e.target.value))
                        }
                        disabled={groups.length === 0}
                    >
                        {groups.length === 0 && (
                            <option value={0}>
                                {dict["select.placeholder"]}
                            </option>
                        )}
                        {groups.map((group, index) => {
                            return (
                                <option
                                    key={
                                        group.layerId +
                                        "_" +
                                        (group.features[0]?.id ?? index)
                                    }
                                    value={index}
                                >
                                    {group.layerName} {index + 1}/{totalGroups}
                                </option>
                            );
                        })}
                    </select>
                </div>

                {selectedGroup && selectedGroup.features.length > 0 && (
                    <DataTable
                        rows={selectedGroup.features.map((f) => f.attributes)}
                        {...(groups.length > 1 && {
                            header: selectedGroup.layerName,
                        })}
                        dict={coreDict}
                    />
                )}
            </ToolPanel>
        );
    },
);
