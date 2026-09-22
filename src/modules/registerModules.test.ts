import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@core/lib/logger";
import type { ModuleContext } from "@core/contracts";
import { registerModules } from "./registerModules";

const stacModuleMock = vi.hoisted(() => ({
    id: "stac",
    dependencies: [] as string[],
    register: vi.fn(async () => {}),
}));

vi.mock("./stac", () => ({ stacModule: stacModuleMock }));

const moduleContext = { locale: {} } as unknown as ModuleContext;

describe("registerModules", () => {
    afterEach(() => {
        stacModuleMock.dependencies = [];
        stacModuleMock.register.mockClear();
        vi.restoreAllMocks();
    });

    it("hands every module the declared-points context", async () => {
        await registerModules(moduleContext);

        expect(stacModuleMock.register).toHaveBeenCalledWith(moduleContext);
    });

    it("warns about a dependency that no registered module provides", async () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        stacModuleMock.dependencies = ["ghost"];

        await registerModules(moduleContext);

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('"ghost"'),
        );
    });

    it("stays silent when every dependency is satisfied by the module set", async () => {
        const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
        stacModuleMock.dependencies = ["stac"];

        await registerModules(moduleContext);

        expect(warn).not.toHaveBeenCalled();
    });
});
