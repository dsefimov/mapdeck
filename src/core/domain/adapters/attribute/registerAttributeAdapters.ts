import type { RootStore } from "@core/framework/store";
import { WfsAttributeAdapter } from "./impl/WfsAttributeAdapter";

export async function registerAttributeAdapters(
    rootStore: RootStore,
): Promise<void> {
    rootStore.attributeAdapterFactory.register(
        "wfs",
        new WfsAttributeAdapter(),
    );
}
