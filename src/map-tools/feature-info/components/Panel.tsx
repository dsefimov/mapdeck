import React from "react";
import { observer } from "mobx-react-lite";
import type { MapToolComponentProps } from "@core/contracts";
import { typedDict } from "@core/lib/text";
import { Button, EmptyState, LoadingScreen } from "@core/ui/components";
import { ToolPanel } from "@core/ui/composites";
import { useEscapeKey, useMapCursor } from "@core/ui/hooks";
import type { FeatureInfoStore } from "../utils/FeatureInfoStore";
import { FeatureInfoController } from "../utils/FeatureInfoController";
import type { FeatureInfoLocaleKey } from "../locale";
import { LayerSelector } from "./LayerSelector";
import { SelectedContent } from "./SelectedContent";

/** Locale key for layers whose protocol cannot provide feature info. */
const UNSUPPORTED_MESSAGE_KEY = "provider.notAvailable";

/**
 * Main FeatureInfo component: a thin observer over FeatureInfoStore. The
 * collection lifecycle lives in the controller (attach/detach on
 * mount/unmount).
 */
export const FeatureInfoComponent: (
    props: MapToolComponentProps & { store: FeatureInfoStore },
) => React.ReactNode = observer(
    ({ map, context, deactivate, overlayManager, store }) => {
        const dict = typedDict<FeatureInfoLocaleKey>(
            context.locale.t("feature-info"),
        );
        const coreDict = context.locale.t("core");

        // Distinct from the tool's own state key ("feature-info" holds the
        // session store) — this one owns the wiring controller.
        const controller = context.stateStore.get(
            "feature-info:controller",
            () => new FeatureInfoController(),
        );

        React.useEffect(() => {
            controller.attach({ map, context, overlayManager, store });
            return () => controller.detach();
        }, [controller, map, context, overlayManager, store]);

        useEscapeKey(deactivate);
        useMapCursor(map, "crosshair");

        const { groups, selectedIndex, loading, hasClicked } = store;

        const selectedGroup = groups[selectedIndex];
        const totalGroups = groups.length;

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
                {!hasClicked && (
                    <EmptyState message={dict["noClickYet"]} />
                )}

                {hasClicked && groups.length === 0 && !loading && (
                    <EmptyState message={dict["noFeatures"]} />
                )}

                {loading && <LoadingScreen />}

                <LayerSelector
                    groups={groups}
                    selectedIndex={selectedIndex}
                    totalGroups={totalGroups}
                    dict={dict}
                    onSelect={(index) => store.setSelectedIndex(index)}
                />

                {selectedGroup && selectedGroup.features.length > 0 && (
                    <SelectedContent
                        group={selectedGroup}
                        totalGroups={totalGroups}
                        dict={coreDict}
                        unsupportedMessage={dict[UNSUPPORTED_MESSAGE_KEY]}
                    />
                )}
            </ToolPanel>
        );
    },
);
