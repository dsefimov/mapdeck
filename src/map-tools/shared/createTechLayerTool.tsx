import React from "react";
import { MAP_TOOL_KIND } from "@core/contracts";
import type {
    InteractiveMapTool,
    MapToolComponentProps,
} from "@core/contracts";
import type { SupportedLanguage, TranslationDict } from "@core/contracts";
import { TechLayerStore } from "@core/domain/map";
import { MeasureController } from "./MeasureController";

/** A measure tool's controller: persisted geometry state plus wiring. */
export interface TechLayerController {
    readonly store: TechLayerStore;
}

/** Everything that distinguishes one measure tool from another. */
export interface TechLayerToolConfig<C extends TechLayerController> {
    /** Tool id — also the state-store key and the locale namespace. */
    readonly id: string;
    readonly icon: string;
    readonly localeTranslations: Partial<
        Record<SupportedLanguage, TranslationDict>
    >;
    /**
     * Builds the tool's controller from a fresh geometry store. Called once
     * per tool id by the instance-state container (ADR-0002, case-2 state).
     */
    readonly createController: (store: TechLayerStore) => C;
    /** Panel rendered with the tool-scoped controller. */
    readonly panel: React.ComponentType<
        MapToolComponentProps & { controller: C }
    >;
}

/**
 * Builds an interactive measure tool whose controller (geometry state plus
 * interaction orchestration) is held in the state container — it survives
 * deactivate → activate cycles.
 */
export function createTechLayerTool<C extends TechLayerController>(
    config: TechLayerToolConfig<C>,
): InteractiveMapTool {
    const { id, panel: Panel } = config;

    // Object.assign, not a post-assignment: the plain-function component
    // type has no displayName slot to write to.
    const Wrapper = Object.assign(
        (props: MapToolComponentProps): React.ReactNode => {
            const controller = props.context.stateStore.get(id, () =>
                config.createController(new TechLayerStore()),
            );
            return <Panel {...props} controller={controller} />;
        },
        { displayName: `${id}-wrapper` },
    );

    return {
        id,
        icon: config.icon,
        kind: MAP_TOOL_KIND.interactive,
        localeTranslations: config.localeTranslations,
        component: Wrapper,
    };
}

/** Controller factory for the plain draw-and-measure tools (ruler, area). */
export function createMeasureController(
    layerPrefix: string,
    drawingKind: "polyline" | "polygon",
): (store: TechLayerStore) => MeasureController {
    return (store) => new MeasureController(store, { layerPrefix, drawingKind });
}
