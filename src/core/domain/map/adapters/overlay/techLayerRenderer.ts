/**
 * Pure renderer for tool tech layers: turns a {@link TechLayerSpec} into the
 * deck.gl overlay layers a measure tool draws with. The store stays a state
 * container; deck.gl construction lives here, at the
 * overlay adapter seam, with the measure colors injected per call.
 */
import {
    PathLayer,
    ScatterplotLayer,
    SolidPolygonLayer,
    LineLayer,
} from "@deck.gl/layers";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import type { Layer } from "@deck.gl/core";
import { convertPointToDegrees, type GeoPoint } from "@core/lib/geo";
import type { MeasureColors } from "@core/ui/theme";
import type { Geometry, TechLayerSpec } from "../../types";

/** Vertex dot radius; the preview point renders at the same size. */
const VERTEX_RADIUS_PX = 6;
/** Zoom-independent clamp for the vertex dots. */
const VERTEX_RADIUS_MIN_PX = 4;
const VERTEX_RADIUS_MAX_PX = 10;

/** Stroke width of committed measure paths and rings. */
const PATH_WIDTH_PX = 3;
/** Zoom-independent clamp for the committed path stroke. */
const PATH_WIDTH_MIN_PX = 2;
const PATH_WIDTH_MAX_PX = 8;

/**
 * Preview line is deliberately thinner than the committed stroke — the
 * not-yet-placed segment must read as provisional.
 */
const PREVIEW_LINE_WIDTH_PX = 2;

const toDegrees = (p: GeoPoint): [number, number, number] =>
    convertPointToDegrees(p);

const polygonDegrees = (
    points: readonly GeoPoint[],
): [number, number, number][] => {
    const ring = points.map(toDegrees);
    if (points.length > 0) ring.push(toDegrees(points[0]!));
    return ring;
};

const buildPointsLayer = (
    prefix: string,
    points: readonly GeoPoint[],
    hasPointGeometries: boolean,
    colors: MeasureColors,
): Layer | null => {
    if (points.length === 0 && !hasPointGeometries) return null;
    return new ScatterplotLayer({
        id: `${prefix}-points`,
        data: points,
        getPosition: toDegrees,
        getRadius: VERTEX_RADIUS_PX,
        getFillColor: colors.stroke,
        radiusUnits: "pixels",
        pickable: true,
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
        radiusMinPixels: VERTEX_RADIUS_MIN_PX,
        radiusMaxPixels: VERTEX_RADIUS_MAX_PX,
    });
};

const buildPathsLayer = (
    prefix: string,
    paths: readonly [number, number, number][][],
    colors: MeasureColors,
): Layer | null => {
    if (paths.length === 0) return null;
    return new PathLayer({
        id: `${prefix}-paths`,
        data: paths,
        getPath: (d: [number, number, number][]) => d,
        getColor: colors.stroke,
        getWidth: PATH_WIDTH_PX,
        widthUnits: "pixels",
        pickable: false,
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
        capRounded: true,
        jointRounded: true,
        widthMinPixels: PATH_WIDTH_MIN_PX,
        widthMaxPixels: PATH_WIDTH_MAX_PX,
    });
};

const buildPolygonsLayer = (
    prefix: string,
    polygons: readonly [number, number, number][][],
    colors: MeasureColors,
): Layer | null => {
    if (polygons.length === 0) return null;
    return new SolidPolygonLayer({
        id: `${prefix}-polygons`,
        data: polygons,
        getPolygon: (d: [number, number, number][]) => d,
        getFillColor: colors.fill,
        extruded: false,
        pickable: false,
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    });
};

const buildPreviewPointLayer = (
    prefix: string,
    previewPoint: GeoPoint | null,
    colors: MeasureColors,
): Layer | null => {
    if (!previewPoint) return null;
    return new ScatterplotLayer({
        id: `${prefix}-preview-point`,
        data: [previewPoint],
        getPosition: toDegrees,
        getRadius: VERTEX_RADIUS_PX,
        getFillColor: colors.preview,
        radiusUnits: "pixels",
        pickable: false,
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    });
};

const buildPreviewLineLayer = (
    prefix: string,
    drawing: Geometry | null,
    previewPoint: GeoPoint | null,
    colors: MeasureColors,
): Layer | null => {
    const last = drawing?.points[drawing.points.length - 1];
    if (!last || !previewPoint) return null;
    return new LineLayer({
        id: `${prefix}-preview-line`,
        data: [[toDegrees(last), toDegrees(previewPoint)]],
        getPath: (d: unknown) => d as [number, number, number][],
        getColor: colors.preview,
        getWidth: PREVIEW_LINE_WIDTH_PX,
        widthUnits: "pixels",
        pickable: false,
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
    });
};

/**
 * Renders the five tech layers of a measure tool as `[id, layer]` pairs for
 * `useOverlayLayers` — null entries remove the layer from the overlay.
 */
export function renderTechLayers(
    prefix: string,
    spec: TechLayerSpec,
    colors: MeasureColors,
): ReadonlyArray<readonly [string, Layer | null]> {
    const allGeometries = spec.drawing
        ? [...spec.geometries, spec.drawing]
        : spec.geometries;

    const polylines = allGeometries.filter((g) => g.kind === "polyline");
    const polygons = allGeometries.filter((g) => g.kind === "polygon");
    const pointGeometries = allGeometries.filter((g) => g.kind === "point");
    const allPoints = allGeometries.flatMap((g) => g.points);

    const pathData: [number, number, number][][] = [
        ...polylines.map((g) => g.points.map(toDegrees)),
        ...polygons.map((g) => polygonDegrees(g.points)),
    ];
    const polygonData: [number, number, number][][] = polygons.map((g) =>
        polygonDegrees(g.points),
    );

    return [
        [
            `${prefix}-points`,
            buildPointsLayer(
                prefix,
                allPoints,
                pointGeometries.length > 0,
                colors,
            ),
        ],
        [`${prefix}-paths`, buildPathsLayer(prefix, pathData, colors)],
        [
            `${prefix}-polygons`,
            buildPolygonsLayer(prefix, polygonData, colors),
        ],
        [
            `${prefix}-preview-point`,
            buildPreviewPointLayer(prefix, spec.previewPoint, colors),
        ],
        [
            `${prefix}-preview-line`,
            buildPreviewLineLayer(
                prefix,
                spec.drawing,
                spec.previewPoint,
                colors,
            ),
        ],
    ];
}
