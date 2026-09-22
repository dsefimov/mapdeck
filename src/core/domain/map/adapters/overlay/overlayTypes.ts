import type { Layer, PickingInfo, DeckProps } from "@deck.gl/core";
import type { MapboxOverlay } from "@deck.gl/mapbox";

/** A deck layer under overlay management, with its visibility flag. */
export type ManagedLayer = {
    id: string;
    layer: Layer;
    visible: boolean;
};

/** Parameters of a deck pick query. */
export type PickParams = {
    x: number;
    y: number;
    radius?: number;
    layerIds?: string[];
    unproject3D?: boolean;
};

/** MapboxOverlay with strictly typed pick and setProps signatures. */
export type TypedOverlay = Omit<
    MapboxOverlay,
    "pickObject" | "pickObjects" | "setProps"
> & {
    pickObject(params: PickParams): PickingInfo | null;
    pickObjects(params: PickParams): PickingInfo[];
    setProps(props: Partial<DeckProps>): void;
};
