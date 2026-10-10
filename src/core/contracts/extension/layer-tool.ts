import type React from "react";
import type { TranslationDict } from "./locale";

/**
 * A layer tool — a UI component rendered in the "More" menu of a layer node.
 *
 * A tool is a plain UI extension and does not declare where it appears.
 * Protocol bindings are established in the tool's own code — its registration
 * function calls `ToolStore.bindToolToProtocol`, the single mechanism linking
 * protocols to tools. Core tools register in `layer-tools/registerTools.ts`,
 * module tools in their module's `register(context)`.
 */
export interface LayerTool {
    /** Unique identifier for the tool */
    readonly id: string;
    /** Factory that creates the React component for a given node ID */
    readonly component: (nodeId: string) => React.ReactNode;
    /** Optional locale translations keyed by language */
    readonly localeTranslations?: Partial<
        Record<string, TranslationDict>
    >;
}
