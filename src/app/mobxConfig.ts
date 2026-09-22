import { configure } from "mobx";

/**
 * MobX strictness for the whole application. Called explicitly from
 * main.tsx — importing this module must stay side-effect free.
 */
export function configureMobX(): void {
    configure({
        enforceActions: "always",
        safeDescriptors: true,
        computedRequiresReaction: true,
    });
}
