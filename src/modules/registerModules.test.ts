import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@core/lib/logger";
import type { Module, ModuleContext } from "@core/contracts";
import { builtInModules, registerModules } from "./registerModules";

const stacModuleMock = vi.hoisted(() => ({
    id: "stac",
    name: "STAC",
    dependencies: [] as string[],
    register: vi.fn(async () => {}),
}));

vi.mock("./stac", () => ({ stacModule: stacModuleMock }));

const moduleContext = {} as unknown as ModuleContext;

function stubModule(id: string): Module {
    return { id, name: id, register: vi.fn(async () => {}) };
}

describe("registerModules", () => {
    afterEach(() => {
        stacModuleMock.dependencies = [];
        stacModuleMock.register.mockClear();
        vi.restoreAllMocks();
    });

    it("exposes the built-in set the assembly prepends", () => {
        expect(builtInModules).toEqual([stacModuleMock]);
    });

    it("hands every module the declared-points context", async () => {
        await registerModules(moduleContext, [stacModuleMock]);

        expect(stacModuleMock.register).toHaveBeenCalledWith(moduleContext);
    });

    it("registers modules in array order", async () => {
        const calls: string[] = [];
        const first = {
            ...stubModule("first"),
            register: vi.fn(async () => {
                calls.push("first");
            }),
        };
        const second = {
            ...stubModule("second"),
            register: vi.fn(async () => {
                calls.push("second");
            }),
        };

        await registerModules(moduleContext, [first, second]);

        expect(calls).toEqual(["first", "second"]);
    });

    it("warns about a dependency that no registered module provides", async () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const module: Module = {
            ...stubModule("needy"),
            dependencies: ["ghost"],
        };

        await registerModules(moduleContext, [module]);

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('"ghost"'),
        );
    });

    it("stays silent when every dependency is satisfied by the module set", async () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        const module: Module = {
            ...stubModule("needy"),
            dependencies: ["provider"],
        };

        await registerModules(moduleContext, [stubModule("provider"), module]);

        expect(warn).not.toHaveBeenCalled();
    });
});
