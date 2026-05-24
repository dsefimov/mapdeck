/**
 * STAC module exports
 * Barrel file for easy imports
 */

// Core components
export type { STACConfig } from "./core/STACConfig";
export { STACClient } from "./core/STACClient";
export { STACCache } from "./core/STACCache";

// Mapping components
export { STACEntityMapper } from "./mapping/STACEntityMapper";

// Adapter
export { STACTreeAdapter } from "./adapter/STACTreeAdapter";

// Module
export { STACModule, stacModule } from "./module/STACModule";

// Types and utilities
export * from "./types";
export {
    resolveBaseUrlFromUrl,
    resolveBaseUrl,
    filterLinksByRel,
} from "./utils/url";
