/**
 * Semantic layer roles defining the behavior and rendering of map layers.
 * Each role corresponds to a specific type of data visualization.
 *
 * LayerRole is a branded string type. Built-in roles are available as constants
 * in the `LayerRoles` object. Modules create their own via `LayerRoles.of(...)`.
 */
declare const LayerRoleBrand: unique symbol;

/**
 * Branded string type for layer roles.
 * Built-in roles available via `LayerRoles.*`.
 * Modules create custom roles via `LayerRoles.of("my-role")`.
 */
export type LayerRole = string & { readonly [LayerRoleBrand]: void };

/**
 * Built-in layer role constants.
 * Separate from the `LayerRole` type to avoid name conflict (no eslint suppression needed).
 */
export const LayerRoles = {
    RASTER: "raster" as LayerRole,
    VECTOR: "vector" as LayerRole,
    POINT_CLOUD: "point-cloud" as LayerRole,
    GEOJSON: "geojson" as LayerRole,

    /** Cast any string to LayerRole — use in module definitions. */
    of: (s: string): LayerRole => s as LayerRole,
} as const;

/**
 * All built-in roles as an array.
 * Used for iteration — does NOT include module-defined roles.
 */
export const BUILT_IN_ROLES: readonly LayerRole[] = [
    LayerRoles.RASTER,
    LayerRoles.VECTOR,
    LayerRoles.POINT_CLOUD,
    LayerRoles.GEOJSON,
];
