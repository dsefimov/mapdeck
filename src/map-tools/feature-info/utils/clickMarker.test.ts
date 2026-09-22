import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "@deck.gl/core";
import type { OverlayManager } from "@core/contracts/domain/map-context";

vi.mock("@deck.gl/layers", () => ({ ScatterplotLayer: class {} }));
vi.mock("@deck.gl/core", () => ({ COORDINATE_SYSTEM: { LNGLAT: 1 } }));

import { removeClickMarker, showClickMarker } from "./clickMarker";

function overlayStub(): OverlayManager<Layer> {
    return {
        isAttached: () => true,
        addLayer: vi.fn(),
        removeLayer: vi.fn(),
    } as unknown as OverlayManager<Layer>;
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("click marker auto-remove", () => {
    it("removes itself after the timeout", () => {
        const om = overlayStub();

        showClickMarker({ lng: 1, lat: 2 }, om);
        expect(om.removeLayer).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(2000);
        expect(om.removeLayer).toHaveBeenCalledTimes(2);
    });

    it("does not let an expired timer remove a newer marker early", () => {
        const om = overlayStub();

        showClickMarker({ lng: 1, lat: 2 }, om, 2000);
        vi.advanceTimersByTime(1000);
        showClickMarker({ lng: 3, lat: 4 }, om, 2000);

        vi.advanceTimersByTime(1000);
        expect(om.removeLayer).toHaveBeenCalledTimes(2);

        vi.advanceTimersByTime(1000);
        expect(om.removeLayer).toHaveBeenCalledTimes(3);
    });

    it("manual removal cancels the pending auto-remove", () => {
        const om = overlayStub();

        showClickMarker({ lng: 1, lat: 2 }, om);
        removeClickMarker(om);

        vi.advanceTimersByTime(5000);
        expect(om.removeLayer).toHaveBeenCalledTimes(2);
    });
});
