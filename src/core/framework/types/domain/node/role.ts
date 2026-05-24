/**
 * NodeRole system — capabilities of a tree node.
 * Each node has a structured set of roles: display (map rendering), attribute (data source),
 * and reports (downloadable files).
 *
 * Core does NOT know about STAC. STAC module maps its data into NodeRoles.
 */
import type { RenderDescriptor } from "../layer/descriptor";

export type NodeRoleCategory = "display" | "attribute" | "report";

/**
 * Configuration for attribute roles (WFS endpoint, etc.).
 */
export interface NodeAttributeConfig {
    endpointUrl: string;
    type: string;
    mimeType?: string;
    params?: Record<string, unknown>;
}

/**
 * Base interface for all role types.
 */
interface NodeRoleBase {
    id: string;
    label: string;
    sourceUrl: string;
    mimeType?: string;
}

/**
 * Display role — for rendering layers on the map.
 * Replaces layerConfig + sourceUrl with a unified render descriptor.
 */
export interface DisplayRole {
    category: "display";
    id: string;
    label: string;
    mimeType?: string;
    render: RenderDescriptor;
}

/**
 * Attribute role - for attribute data sources (WFS endpoints, etc.).
 */
export interface AttributeRole extends NodeRoleBase {
    category: "attribute";
    attributeConfig: NodeAttributeConfig;
}

/**
 * Report role - for downloadable reports.
 */
export interface ReportRole extends NodeRoleBase {
    category: "report";
    // No additional config needed, sourceUrl is the download link
}

/**
 * A single role describing one capability of a node.
 */
export type NodeRole = DisplayRole | AttributeRole | ReportRole;

/**
 * Structured roles for a tree node.
 *
 * Cardinality rules:
 * - display: at most one (optional for GroupNode, required for LayerNode)
 * - attribute: zero or one
 * - reports: any number (including zero)
 * - extensions: slot for module-defined roles
 */
export interface NodeRoles {
    display?: DisplayRole;
    attribute?: AttributeRole;
    reports: ReportRole[];
    extensions?: Record<string, unknown>;
}

/**
 * Structured roles for a LayerNode — display role is required.
 */
export interface LayerNodeRoles extends NodeRoles {
    display: DisplayRole;
}
