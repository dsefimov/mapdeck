/**
 * Factory for managing source adapters by source type.
 */
import {
    type SourceAdapter,
    type SourceAdapterFactory as SourceAdapterFactoryPort,
} from "@core/contracts";
import { KeyedRegistry, type RegisterOptions } from "@core/lib/registry";

export class SourceAdapterFactory implements SourceAdapterFactoryPort {
    private readonly adapters = new KeyedRegistry<string, SourceAdapter>(
        "Source adapter",
    );

    /**
     * Register an adapter under its source type, initializing it first so it
     * is ready to serve before anyone can `get` it. Duplicate types throw
     * unless `opts.override` is set.
     */
    register(
        adapter: SourceAdapter,
        config?: Record<string, unknown>,
        opts?: RegisterOptions,
    ): void {
        if (config !== undefined) {
            adapter.initialize(config);
        }
        this.adapters.register(adapter.type, adapter, opts);
    }

    /** The adapter registered for `type`, or undefined for an unknown type. */
    get(type?: string): SourceAdapter | undefined {
        return type ? this.adapters.get(type) : undefined;
    }
}
