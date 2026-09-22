import { useEffect, useRef, type RefObject } from "react";
import maplibregl from "maplibre-gl";
import type { StoreRegistry } from "@core/store-registry";

/** Create/dispose the maplibre map and start basemap sync. Runs once. */
export function useMapLifecycle(
    containerRef: RefObject<HTMLDivElement | null>,
    rootStore: StoreRegistry,
): RefObject<maplibregl.Map | null> {
    const mapRef = useRef<maplibregl.Map | null>(null);
    const initRef = useRef(false);

    useEffect(() => {
        if (initRef.current || !containerRef.current) return;
        initRef.current = true;

        rootStore.mapStore.initializeMap(containerRef.current);
        const map = rootStore.mapStore.getMap();
        if (!map) return;
        mapRef.current = map;

        map.once("load", () => {
            rootStore.basemapStore.findAndApplyInitialBasemap();
            rootStore.basemapStore.startSync();
        });

        return () => {
            initRef.current = false;
            rootStore.basemapStore.stopSync();
            rootStore.mapStore.dispose();
            mapRef.current = null;
        };
    }, [rootStore]);

    return mapRef;
}
