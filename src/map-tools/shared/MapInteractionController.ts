import type maplibregl from "maplibre-gl";

/** Deps every map-interaction controller needs — the map being wired. */
export interface MapInteractionDeps {
    readonly map: maplibregl.Map;
}

/** One map listener: the event name and the handler attach wires. */
export interface MapHandlerBinding {
    readonly event: "click" | "mousemove" | "mousedown" | "mouseup";
    readonly listener: (event: maplibregl.MapMouseEvent) => void;
}

/**
 * Base wiring for map-tool controllers: attach stores the
 * deps, wires the subclass's handler list plus the window keydown, and
 * detach mirrors it exactly — a listener added to the list is unwired for
 * free, so the attach/detach pair can never drift apart.
 */
export abstract class MapInteractionController<
    TDeps extends MapInteractionDeps,
> {
    protected deps: TDeps | null = null;

    attach(deps: TDeps): void {
        this.detach();
        this.deps = deps;

        for (const { event, listener } of this.mapHandlers()) {
            deps.map.on(event, listener);
        }
        window.addEventListener("keydown", this.handleKeyDown);

        this.onAttached();
    }

    /** Unwires everything attach wired — safe to call twice. */
    detach(): void {
        const deps = this.deps;
        if (!deps) return;

        for (const { event, listener } of this.mapHandlers()) {
            deps.map.off(event, listener);
        }
        window.removeEventListener("keydown", this.handleKeyDown);
        this.deps = null;
    }

    /** The map listeners of this controller; detach mirrors the list. */
    protected abstract mapHandlers(): ReadonlyArray<MapHandlerBinding>;

    /** Window keyboard routing (Escape and friends). */
    protected abstract handleKeyDown(event: KeyboardEvent): void;

    /** Runs after the wiring lands — starting a drawing and the like. */
    protected onAttached(): void {}
}

/** Middle-press detection shared by the measure gestures. */
export function isMiddleClick(
    event: maplibregl.MapMouseEvent,
): boolean {
    return (
        event.originalEvent instanceof MouseEvent &&
        event.originalEvent.button === 1
    );
}
