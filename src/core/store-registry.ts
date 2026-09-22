/**
 * The single access point to all application state: the composition of the
 * technical `CommonRegistry` and the domain `DomainRegistry`, plus the
 * declared-points contexts the composition root assembles over them
 * (ADR-0004/0006). Concrete implementation is `RootStore` in `app/`.
 */
import type { CommonRegistry } from "@core/common/common-registry";
import type { DomainRegistry } from "@core/domain/domain-registry";
import type {
    ModuleContext,
    ToolRuntimeContext,
} from "@core/contracts";

export interface StoreRegistry extends CommonRegistry, DomainRegistry {
    /** Declared-points context for tool panels (ADR-0006). */
    readonly toolContext: ToolRuntimeContext;
    /** Declared-points registration context for modules (ADR-0004). */
    readonly moduleContext: ModuleContext;
}
