import type React from "react";
import type { LayerRole } from "./role";
import type {
    SupportedLanguage,
    TranslationDict,
} from "../../framework/locale";

/**
 * Union type for layer tool role specification.
 * - Single role: `LayerRoles.RASTER`
 * - Multiple roles: `[LayerRoles.RASTER, LayerRoles.VECTOR]`
 * - All roles: `"all"`
 */
export type LayerToolRole = LayerRole | LayerRole[] | "all";

/**
 * A layer tool — a UI component rendered in the "More" menu of a layer node.
 * Each tool declares which layer role(s) it applies to.
 */
export interface LayerTool {
    /** Unique identifier for the tool */
    readonly id: string;
    /** Which layer role(s) this tool applies to */
    readonly role: LayerToolRole;
    /** Factory that creates the React component for a given node ID */
    readonly component: (nodeId: string) => React.ReactNode;
    /** Optional locale translations keyed by language */
    readonly localeTranslations?: Partial<
        Record<SupportedLanguage, TranslationDict>
    >;
}
