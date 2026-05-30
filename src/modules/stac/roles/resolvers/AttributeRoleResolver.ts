import type { AttributeRole, NodeAttributeConfig } from "@core/framework/types";
import type { IRoleResolver, ResolveContext } from "../IRoleResolver";
import type { STACAsset } from "../../types";

const ATTRIBUTE_ROLES = new Set(["wfs", "ogc-feature-api"]);

export class AttributeRoleResolver implements IRoleResolver {
    readonly priority = 10;

    canResolve(asset: STACAsset): boolean {
        return asset.roles?.some((r) => ATTRIBUTE_ROLES.has(r)) ?? false;
    }

    resolve(asset: STACAsset, ctx: ResolveContext): AttributeRole {
        const adapterType =
            asset.roles?.find((r) => ATTRIBUTE_ROLES.has(r)) ?? "wfs";
        const attributeConfig: NodeAttributeConfig = {
            endpointUrl: asset.href,
            type: adapterType,
        };
        if (asset.type) attributeConfig.mimeType = asset.type;

        const result: AttributeRole = {
            id: ctx.assetKey,
            category: "attribute",
            label: asset.title ?? ctx.assetKey,
            sourceUrl: asset.href,
            attributeConfig,
        };
        if (asset.type) result.mimeType = asset.type;
        return result;
    }
}
