import { useEffect, useRef, type RefObject } from "react";
import maplibregl from "maplibre-gl";
import type { RootStore } from "@core/framework/store";
import { initBasemap } from "./initBasemap";

/** Create/dispose the maplibre map and start basemap sync. Runs once. */
export function useMapLifecycle(
    containerRef: RefObject<HTMLDivElement | null>,
    rootStore: RootStore,
): RefObject<maplibregl.Map | null> {
    const mapRef = useRef<maplibregl.Map | null>(null);
    const initRef = useRef(false);

    useEffect(() => {
        if (initRef.current || !containerRef.current) return;
        initRef.current = true;

        rootStore.mapStore.initializeMap(containerRef.current);
        const map = rootStore.mapStore.getMap()!;
        mapRef.current = map;

        map.once("load", () => {
            initBasemap(rootStore, map);
        });

        return () => {
            initRef.current = false;
            rootStore.mapStore.dispose();
            mapRef.current = null;
        };
    }, [rootStore]);

    return mapRef;
}
