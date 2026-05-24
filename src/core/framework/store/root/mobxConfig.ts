import { configure } from "mobx";

export function configureMobX(): void {
    configure({
        enforceActions: "always",
        safeDescriptors: true,
        computedRequiresReaction: true,
    });
}

// Automatically configure MobX when this module is imported
configureMobX();
