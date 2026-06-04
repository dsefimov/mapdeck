import React, { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import type { MapToolComponentProps } from "@core/framework/types";
import { checkBasemapHealth } from "../utils/checkBasemapHealth";
import { BASEMAP_TOOL_ID } from "./Tool";

import styles from "./Grid.module.css";

type BasemapStatus = "loading" | "success" | "error";

function getPreviewUrl(tileUrl: string): string {
    return tileUrl
        .replace(/{z}/g, "0")
        .replace(/{x}/g, "0")
        .replace(/{y}/g, "0");
}

export const BasemapComponent: (
    props: MapToolComponentProps,
) => React.ReactNode = observer(({ rootStore }) => {
    const dict = rootStore.localeStore.t(BASEMAP_TOOL_ID);
    const [statusMap, setStatusMap] = useState<Map<string, BasemapStatus>>(
        new Map(),
    );

    const availableBasemaps = rootStore.mapStore.availableBasemaps;

    useEffect(() => {
        let alive = true;
        const basemaps = rootStore.mapStore.availableBasemaps;
        for (const basemap of basemaps) {
            setStatusMap((prev) => {
                if (prev.has(basemap.id)) {
                    return prev;
                }
                const next = new Map(prev);
                next.set(basemap.id, "loading");
                return next;
            });

            checkBasemapHealth(basemap.url, 3000).then((isAvailable) => {
                if (!alive) return;
                setStatusMap((prev) => {
                    const next = new Map(prev);
                    next.set(basemap.id, isAvailable ? "success" : "error");
                    return next;
                });
            });
        }
        return () => {
            alive = false;
        };
    }, [rootStore]);

    const activeBasemapId = rootStore.mapStore.activeBasemap?.id;

    return (
        <div className={styles.basemap_component}>
            {availableBasemaps.map((basemap) => {
                const previewUrl = getPreviewUrl(basemap.url);
                const status = statusMap.get(basemap.id) ?? "loading";
                const isActive = activeBasemapId === basemap.id;
                const isDisabled = status === "error";

                const cardClass = [
                    styles.basemap_card,
                    isActive ? styles.basemap_card_active : "",
                    isDisabled ? styles.basemap_card_disabled : "",
                ]
                    .filter(Boolean)
                    .join(" ");

                return (
                    <button
                        key={basemap.id}
                        className={cardClass}
                        onClick={() =>
                            rootStore.mapStore.setActiveBasemap(basemap.id)
                        }
                        title={
                            isDisabled
                                ? dict["status.unavailable"]
                                : basemap.name
                        }
                        disabled={isDisabled}
                    >
                        <div
                            className={styles.basemap_card_preview}
                            style={{
                                backgroundImage:
                                    status === "success"
                                        ? `url(${previewUrl})`
                                        : "none",
                                backgroundSize: "cover",
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "center",
                            }}
                        >
                            {status === "error" && (
                                <span className={styles.error_text}>
                                    {dict["status.unavailable"]}
                                </span>
                            )}
                        </div>
                        <span className={styles.basemap_card_label}>
                            {basemap.name}
                        </span>
                    </button>
                );
            })}
        </div>
    );
});
