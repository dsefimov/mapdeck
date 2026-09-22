import React from "react";
import { observer } from "mobx-react-lite";
import { formatDistance } from "@core/lib/geo";
import { formatDict, typedDict } from "@core/lib/text";
import type { MeasureController } from "@map-tools/shared/MeasureController";
import { MeasurePanel } from "@map-tools/shared/MeasurePanel";

import type { MapToolComponentProps } from "@core/contracts";
import type { Segment } from "@core/ui/composites";
import { measurePolyline3D } from "../logic/distance";
import type { Ruler3dLocaleKey } from "../locale";
import { RULER_3D_ID } from "./Tool";

export const Ruler3DComponent: (
    props: MapToolComponentProps & { controller: MeasureController },
) => React.ReactNode = observer(
    ({ context, controller, ...props }) => {
        const dict = typedDict<Ruler3dLocaleKey>(
            context.locale.t(RULER_3D_ID),
        );
        const points = controller.store.drawing?.points ?? [];

        const { segments, totalDistance, totalHorizontal, totalVertical } =
            measurePolyline3D(points);

        const segmentItems: Segment[] = segments.map((seg, i) => ({
            label: formatDict(dict["segment.label"], {
                from: i + 1,
                to: i + 2,
            }),
            value: formatDistance(seg.distanceMeters),
            details: [
                {
                    label: dict["segment.horizontal"],
                    value: formatDistance(seg.horizontalDistance),
                },
                {
                    label: dict["segment.vertical"],
                    value: formatDistance(seg.verticalDistance),
                },
            ],
        }));

        return (
            <MeasurePanel
                controller={controller}
                props={{ context, ...props }}
                layerPrefix={RULER_3D_ID}
                dict={dict}
                pointCount={points.length}
                showSummary={points.length > 0}
                summaryItems={[
                    {
                        label: dict["summary.totalDistance"],
                        value: formatDistance(totalDistance),
                    },
                    {
                        label: dict["summary.horizontal"],
                        value: formatDistance(totalHorizontal),
                        dot: "horizontal",
                    },
                    {
                        label: dict["summary.vertical"],
                        value: formatDistance(totalVertical),
                        dot: "vertical",
                    },
                    {
                        label: dict["summary.points"],
                        value: String(points.length),
                    },
                ]}
                segmentItems={segmentItems}
            />
        );
    },
);

export default Ruler3DComponent;
