import type { NodeRole } from "@core/framework/types";
import type { IRoleResolver, ResolveContext } from "./IRoleResolver";
import type { STACAsset } from "../types";

export class RoleResolverRegistry {
  private resolvers: IRoleResolver[] = [];

  /**
   * Registers a resolver. Registration order does not matter;
   * resolvers are sorted by priority on insertion.
   */
  register(resolver: IRoleResolver): void {
    this.resolvers.push(resolver);
    this.resolvers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Returns the NodeRole from the first matching resolver, or null.
   * Iterates in ascending priority order.
   */
  resolve(asset: STACAsset, ctx: ResolveContext): NodeRole | null {
    for (const resolver of this.resolvers) {
      if (resolver.canResolve(asset, ctx)) {
        return resolver.resolve(asset, ctx);
      }
    }
    return null;
  }
}
