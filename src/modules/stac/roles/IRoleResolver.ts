import type { NodeRole } from "@core/framework/types";
import type { LayerConfigRegistry } from "@core/domain/adapters";
import type { STACAsset } from "../types";

export interface ResolveContext {
  readonly assetKey: string;
  readonly registry: LayerConfigRegistry;
  readonly properties?: Record<string, unknown>;
  readonly itemBbox?: readonly number[];
  readonly stac_extensions?: readonly string[];
}

export interface IRoleResolver {
  /**
   * Priority: lower values are checked first.
   * 0   — report (always first)
   * 10  — attribute (wfs, ogc-feature-api)
   * 20+ — display roles
   */
  readonly priority: number;

  /**
   * Returns true when this resolver can handle the asset.
   * Called for every asset — must be cheap (checks only, no network).
   */
  canResolve(asset: STACAsset, ctx: ResolveContext): boolean;

  /**
   * Creates a NodeRole. Called only if canResolved returned true.
   * Pure function: no side effects, no argument mutation.
   */
  resolve(asset: STACAsset, ctx: ResolveContext): NodeRole;
}
