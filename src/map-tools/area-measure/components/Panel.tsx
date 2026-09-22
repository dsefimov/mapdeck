import React from "react";
import { observer } from "mobx-react-lite";
import { formatDistance, formatArea } from "@core/lib/geo";
import { formatDict, typedDict } from "@core/lib/text";
import type { MeasureController } from "@map-tools/shared/MeasureController";
import { MeasurePanel } from "@map-tools/shared/MeasurePanel";

import type { MapToolComponentProps } from "@core/contracts";
import type { Segment } from "@core/ui/composites";
import { measurePolygonArea } from "../logic/area";
import type { AreaMeasureLocaleKey } from "../locale";
import { AREA_MEASURE_ID } from "./Tool";

export const AreaMeasureComponent: (
    props: MapToolComponentProps & { controller: MeasureController },
) => React.ReactNode = observer(
    ({ context, controller, ...props }) => {
        const dict = typedDict<AreaMeasureLocaleKey>(
            context.locale.t(AREA_MEASURE_ID),
        );
        const points = controller.store.drawing?.points ?? [];

        const measurements = measurePolygonArea(points);

        const segmentItems: Segment[] = measurements.edges.map((edge, i) => ({
            label: formatDict(dict["segment.label"], {
                from: i + 1,
                to: i + 2,
            }),
            value: formatDistance(edge.distanceMeters),
        }));

        return (
            <MeasurePanel
                controller={controller}
                props={{ context, ...props }}
                layerPrefix={AREA_MEASURE_ID}
                dict={dict}
                pointCount={points.length}
                showSummary={points.length >= 3}
                summaryItems={[
                    {
                        label: dict["summary.area"],
                        value: formatArea(measurements.areaSquareMeters),
                    },
                    {
                        label: dict["summary.perimeter"],
                        value: formatDistance(measurements.perimeterMeters),
                    },
                    {
                        label: dict["summary.vertices"],
                        value: String(measurements.vertexCount),
                    },
                ]}
                segmentItems={segmentItems}
            />
        );
    },
);

export default AreaMeasureComponent;
