import type { Layer, PickingInfo, DeckProps } from "@deck.gl/core";
import type { MapboxOverlay } from "@deck.gl/mapbox";

export type ManagedLayer = {
    id: string;
    layer: Layer;
    visible: boolean;
};

export type OverlayConfig = Partial<Record<string, unknown>>;

export type PickParams = {
    x: number;
    y: number;
    radius?: number;
    layerIds?: string[];
    unproject3D?: boolean;
};

export type TypedOverlay = Omit<
    MapboxOverlay,
    "pickObject" | "pickObjects" | "setProps"
> & {
    pickObject(params: PickParams): PickingInfo | null;
    pickObjects(params: PickParams): PickingInfo[];
    setProps(props: Partial<DeckProps>): void;
};
