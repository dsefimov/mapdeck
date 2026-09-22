import React, { type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import type { MapToolComponentProps } from "@core/contracts";
import type { BaseMapConfig, BasemapStatus } from "@core/contracts";
import { Text } from "@core/ui/components";
import { BASEMAP_TOOL_ID } from "../toolId";

import styles from "./Grid.module.css";

interface CardProps {
    basemap: BaseMapConfig;
    status: BasemapStatus;
    isActive: boolean;
    dict: Record<string, string>;
    onSelect: (id: string) => void;
}

/** Background style of the preview tile; empty when there is nothing to show. */
function previewStyle(
    previewSrc: string | null,
    status: BasemapStatus,
): React.CSSProperties {
    if (!previewSrc || status === "error") return {};
    return {
        backgroundImage: `url(${previewSrc})`,
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
    };
}

const BasemapCard: (props: CardProps) => ReactNode = observer(
    ({ basemap, status, isActive, dict, onSelect }) => {
        const isDisabled = status === "error";
        const previewSrc = basemap.previewImage ?? null;
        const showPlaceholder = !previewSrc;

        const cardClass = [
            styles.basemap_card,
            isActive ? styles.basemap_card_active : "",
            isDisabled ? styles.basemap_card_disabled : "",
        ]
            .filter(Boolean)
            .join(" ");

        return (
            <button
                className={cardClass}
                onClick={() => onSelect(basemap.id)}
                title={isDisabled ? dict["status.unavailable"] : basemap.name}
                disabled={isDisabled}
            >
                <div
                    className={styles.basemap_card_preview}
                    style={previewStyle(previewSrc, status)}
                >
                    {showPlaceholder && status !== "error" && (
                        <Text
                            variant="title"
                            tone="muted"
                            className={styles.placeholder}
                        >
                            {basemap.name.charAt(0).toUpperCase()}
                        </Text>
                    )}
                    {isDisabled && (
                        <Text
                            variant="hint"
                            tone="error"
                            weight="semibold"
                            className={styles.error_text}
                        >
                            {dict["status.unavailable"]}
                        </Text>
                    )}
                </div>
                <Text
                    variant="body"
                    className={styles.basemap_card_label}
                >
                    {basemap.name}
                </Text>
            </button>
        );
    },
);

export const BasemapComponent: (
    props: MapToolComponentProps,
) => React.ReactNode = observer(({ context }) => {
    const dict = context.locale.t(BASEMAP_TOOL_ID);
    const basemapStore = context.basemap;

    const activeBasemapId = basemapStore.activeBasemap?.id;

    return (
        <div className={styles.basemap_component}>
            {basemapStore.availableBasemaps.map((basemap) => (
                <BasemapCard
                    key={basemap.id}
                    basemap={basemap}
                    status={basemapStore.healthStatuses.get(basemap.id) ?? "loading"}
                    isActive={activeBasemapId === basemap.id}
                    dict={dict}
                    onSelect={(id) =>
                        basemapStore.setActiveBasemap(id)
                    }
                />
            ))}
        </div>
    );
});
