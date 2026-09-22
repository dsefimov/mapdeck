import { afterEach, describe, expect, it, vi } from "vitest";
import type { Viewport } from "@deck.gl/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { FrustumPlanes } from "@core/lib/geo";
import { ViewportManager } from "./ViewportManager";

const PLANES: FrustumPlanes = {
    near: { normal: [0, 0, -1], distance: -1 },
    far: { normal: [0, 0, -1], distance: -1 },
    left: { normal: [0, 0, -1], distance: -1 },
    right: { normal: [0, 0, -1], distance: -1 },
    top: { normal: [0, 0, -1], distance: -1 },
    bottom: { normal: [0, 0, -1], distance: -1 },
};

type Handler = () => void;

/** Fake map that captures registered handlers so tests can emit and inspect them. */
function emitterMap(fovDegrees = 45) {
    const handlers = new Map<string, Set<Handler>>();
    const map = {
        on: vi.fn((type: string, fn: Handler) => {
            if (!handlers.has(type)) handlers.set(type, new Set());
            handlers.get(type)!.add(fn);
        }),
        off: vi.fn((type: string, fn: Handler) => {
            handlers.get(type)?.delete(fn);
        }),
        emit(type: string) {
            for (const fn of handlers.get(type) ?? []) fn();
        },
        eventNames(): string[] {
            return [...handlers.keys()];
        },
        listenerCount(type: string): number {
            return handlers.get(type)?.size ?? 0;
        },
        getBounds: () => ({
            getWest: () => 10,
            getSouth: () => 10,
            getEast: () => 11,
            getNorth: () => 11,
        }),
        getVerticalFieldOfView: () => fovDegrees,
    };
    return map;
}

function fakeViewport(): Viewport {
    return {
        center: [0, 0, 0],
        cameraPosition: [0, 0, 1000],
        projectPosition: (xyz: number[]) => [xyz[0], xyz[1], xyz[2]],
    } as unknown as Viewport;
}

function fullProvider() {
    return {
        getCameraPosition: (): [number, number, number] => [10.5, 10.5, 100],
        getFrustumPlanes: () => PLANES,
        getActiveViewport: () => fakeViewport(),
    };
}

afterEach(() => {
    vi.useRealTimers();
});

describe("ViewportManager subscription shape", () => {
    it("subscribes moveend/zoomend/pitchend, and move only with an immediate callback", () => {
        const withImmediate = emitterMap();
        new ViewportManager(
            withImmediate as unknown as MapLibreMap,
            vi.fn(),
            { provider: fullProvider(), onImmediateChange: vi.fn() },
        ).start();

        expect(withImmediate.eventNames()).toEqual([
            "moveend",
            "zoomend",
            "pitchend",
            "move",
        ]);

        const withoutImmediate = emitterMap();
        new ViewportManager(
            withoutImmediate as unknown as MapLibreMap,
            vi.fn(),
            { provider: fullProvider() },
        ).start();

        expect(withoutImmediate.eventNames()).toEqual([
            "moveend",
            "zoomend",
            "pitchend",
        ]);
    });
});

describe("ViewportManager camera snapshot", () => {
    it("reads the vertical FOV from the map camera", () => {
        const map = emitterMap(45);
        const onChange = vi.fn();

        const manager = new ViewportManager(
            map as unknown as MapLibreMap,
            onChange,
            { provider: fullProvider() },
        );

        manager.start();

        expect(onChange).toHaveBeenCalledTimes(1);
        const [, camera] = onChange.mock.calls[0]!;
        expect(camera.fovRadians).toBeCloseTo((45 * Math.PI) / 180, 10);
        expect(camera.cameraDirection).toEqual([0, 0, -1]);

        manager.stop();
    });

    it("passes the map bounds and a camera snapshot to both channels", () => {
        vi.useFakeTimers();
        const map = emitterMap();
        const onChange = vi.fn();
        const onImmediate = vi.fn();

        const manager = new ViewportManager(map as unknown as MapLibreMap, onChange, {
            provider: fullProvider(),
            onImmediateChange: onImmediate,
        });
        manager.start();
        onChange.mockClear();
        onImmediate.mockClear();

        map.emit("move");
        map.emit("moveend");
        vi.advanceTimersByTime(150);

        for (const callback of [onImmediate, onChange]) {
            expect(callback).toHaveBeenCalledTimes(1);
            const [viewport, camera] = callback.mock.calls[0]!;
            expect(viewport.bounds).toEqual([10, 10, 11, 11]);
            expect(camera.fovRadians).toBeCloseTo((45 * Math.PI) / 180, 10);
        }

        manager.stop();
    });
});

describe("ViewportManager debounce", () => {
    it("coalesces a burst of viewport events into one trailing callback", () => {
        vi.useFakeTimers();
        const map = emitterMap();
        const onChange = vi.fn();

        const manager = new ViewportManager(map as unknown as MapLibreMap, onChange, {
            provider: fullProvider(),
        });
        manager.start();
        onChange.mockClear();

        map.emit("moveend");
        map.emit("moveend");
        map.emit("zoomend");
        expect(onChange).not.toHaveBeenCalled();

        vi.advanceTimersByTime(150);
        expect(onChange).toHaveBeenCalledTimes(1);

        manager.stop();
    });

    it("fires the immediate callback on every move event, undelayed", () => {
        vi.useFakeTimers();
        const map = emitterMap();
        const onImmediate = vi.fn();

        const manager = new ViewportManager(map as unknown as MapLibreMap, vi.fn(), {
            provider: fullProvider(),
            onImmediateChange: onImmediate,
        });
        manager.start();
        onImmediate.mockClear();

        map.emit("move");
        map.emit("move");
        expect(onImmediate).toHaveBeenCalledTimes(2);

        vi.advanceTimersByTime(300);
        expect(onImmediate).toHaveBeenCalledTimes(2);

        manager.stop();
    });
});

describe("ViewportManager stop/destroy", () => {
    it("stop removes the exact handler references it registered", () => {
        vi.useFakeTimers();
        const map = emitterMap();
        const onChange = vi.fn();
        const onImmediate = vi.fn();

        const manager = new ViewportManager(map as unknown as MapLibreMap, onChange, {
            provider: fullProvider(),
            onImmediateChange: onImmediate,
        });
        manager.start();
        onChange.mockClear();
        onImmediate.mockClear();

        manager.stop();

        expect(map.off.mock.calls).toEqual(map.on.mock.calls);
        expect(map.listenerCount("moveend")).toBe(0);
        expect(map.listenerCount("move")).toBe(0);

        map.emit("moveend");
        map.emit("move");
        vi.advanceTimersByTime(150);
        expect(onChange).not.toHaveBeenCalled();
        expect(onImmediate).not.toHaveBeenCalled();
    });

    it("destroy detaches like stop", () => {
        const map = emitterMap();
        const manager = new ViewportManager(map as unknown as MapLibreMap, vi.fn(), {
            provider: fullProvider(),
        });
        manager.start();

        manager.destroy();

        expect(map.off.mock.calls).toEqual(map.on.mock.calls);
        expect(map.listenerCount("moveend")).toBe(0);
    });
});

describe("ViewportManager degenerate camera state", () => {
    it.each([
        [
            "no provider is given",
            { provider: undefined },
        ],
        [
            "camera position is unavailable",
            { provider: { ...fullProvider(), getCameraPosition: () => null } },
        ],
        [
            "frustum planes are unavailable",
            { provider: { ...fullProvider(), getFrustumPlanes: () => null } },
        ],
        [
            "active viewport is unavailable",
            { provider: { ...fullProvider(), getActiveViewport: () => null } },
        ],
    ])("fires nothing on either channel while %s", (_case, options) => {
        vi.useFakeTimers();
        const map = emitterMap();
        const onChange = vi.fn();
        const onImmediate = vi.fn();

        const manager = new ViewportManager(map as unknown as MapLibreMap, onChange, {
            debounceMs: 0,
            onImmediateChange: onImmediate,
            ...(options as Record<string, unknown>),
        });
        manager.start();

        map.emit("moveend");
        map.emit("move");
        vi.advanceTimersByTime(150);

        expect(onChange).not.toHaveBeenCalled();
        expect(onImmediate).not.toHaveBeenCalled();

        manager.stop();
    });
});
