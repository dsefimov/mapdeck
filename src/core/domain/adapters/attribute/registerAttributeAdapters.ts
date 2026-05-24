import { attributeAdapterFactory } from "./AttributeAdapterFactory";
import type { RootStore } from "@core/framework/store";
import { WfsAttributeAdapter } from "./impl/WfsAttributeAdapter";

export async function registerAttributeAdapters(
    rootStore?: RootStore,
): Promise<void> {
    const target =
        rootStore?.attributeAdapterFactory ?? attributeAdapterFactory;
    target.register("wfs", new WfsAttributeAdapter());
}
