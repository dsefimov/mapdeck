import { afterEach, describe, expect, it, vi } from "vitest";
import { configureLogger, logger } from "./logger";

afterEach(() => {
    vi.restoreAllMocks();
    configureLogger("warn");
});

describe("logger threshold", () => {
    it("suppresses debug and info at the default warn threshold", () => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
        const info = vi.spyOn(console, "info").mockImplementation(() => {});

        logger.debug("quiet");
        logger.info("quiet");

        expect(debug).not.toHaveBeenCalled();
        expect(info).not.toHaveBeenCalled();
    });

    it("passes warn and error at the default threshold", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const error = vi.spyOn(console, "error").mockImplementation(() => {});

        logger.warn("loud");
        logger.error("louder");

        expect(warn).toHaveBeenCalledWith("[mapdeck:warn]", "loud");
        expect(error).toHaveBeenCalledWith("[mapdeck:error]", "louder");
    });

    it("raises visibility with configureLogger", () => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => {});

        configureLogger("debug");
        logger.debug("visible now");

        expect(debug).toHaveBeenCalledWith(
            "[mapdeck:debug]",
            "visible now",
        );
    });

    it("an error-only threshold silences warnings", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        configureLogger("error");
        logger.warn("silenced");

        expect(warn).not.toHaveBeenCalled();
    });
});
