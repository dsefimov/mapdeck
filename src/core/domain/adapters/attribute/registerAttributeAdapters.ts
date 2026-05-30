import type { RootStore } from "@core/framework/store";
import { WfsAttributeAdapter } from "./impl/WfsAttributeAdapter";
import { OgcFeaturesAttributeAdapter } from "./impl/OgcFeaturesAttributeAdapter";

export async function registerAttributeAdapters(
    rootStore: RootStore,
): Promise<void> {
    rootStore.attributeAdapterFactory.register(
        "wfs",
        new WfsAttributeAdapter(),
    );
    rootStore.attributeAdapterFactory.register(
        "ogc-features",
        new OgcFeaturesAttributeAdapter(),
    );
}
