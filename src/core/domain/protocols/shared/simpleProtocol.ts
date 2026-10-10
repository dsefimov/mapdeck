/**
 * Factory for simple protocols — the declarative descriptor a protocol fills
 * in when it has no request logic of its own: protocols of the same data
 * type reuse the shared render adapters.
 * A protocol folder with only a descriptor is data, not code.
 */
import type {
    LayerAdapter,
    LayerStyle,
    Protocol,
    RenderDescriptor,
} from "@core/contracts";
import { resolveStyle } from "../logic/resolveStyle";

/** Inputs the config builder receives: everything a simple protocol needs. */
export interface SimpleConfigInput {
    readonly sourceUrl: string;
    /** Node style merged over the protocol default. */
    readonly style: LayerStyle;
    /** Protocol params of the node's binding (single source of truth). */
    readonly params: Record<string, unknown>;
}

/** The declarative descriptor a simple protocol fills in. */
export interface SimpleProtocolDescriptor<C> {
    readonly id: string;
    readonly label: string;
    readonly defaultStyle: LayerStyle;
    /** The shared render adapter this protocol draws through. */
    readonly adapter: LayerAdapter;
    /** Builds the protocol-specific config from the resolved inputs. */
    readonly buildConfig: (input: SimpleConfigInput) => C;
}

/**
 * Builds a protocol from a declarative descriptor. The result is a plain
 * object satisfying `Protocol` — the class-shape rule covers extension
 * kinds, not protocol implementations.
 */
export function createSimpleProtocol<C>(
    descriptor: SimpleProtocolDescriptor<C>,
): Protocol<C> {
    return {
        id: descriptor.id,
        label: descriptor.label,
        defaultStyle: descriptor.defaultStyle,
        getLayerAdapter: () => descriptor.adapter,
        createRenderDescriptor(
            sourceUrl: string,
            style?: LayerStyle,
            params: Record<string, unknown> = {},
        ): RenderDescriptor<C> {
            return {
                sourceUrl,
                config: descriptor.buildConfig({
                    sourceUrl,
                    style: resolveStyle(descriptor.defaultStyle, style),
                    params,
                }),
            };
        },
    };
}
