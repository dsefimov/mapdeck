import { afterEach, describe, expect, it, vi } from "vitest";
import { configureLogger, logger } from "./logger";

afterEach(() => {
    vi.restoreAllMocks();
    configureLogger("warn");
});

describe("logger threshold", () => {
    it("suppresses debug and info at the default warn threshold", () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const info = vi.spyOn(console, "info").mockImplementation(() => {});

        logger.debug("quiet");
        logger.info("quiet");

        expect(log).not.toHaveBeenCalled();
        expect(info).not.toHaveBeenCalled();
    });

    it("passes warn and error at the default threshold", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const error = vi.spyOn(console, "error").mockImplementation(() => {});

        logger.warn("loud");
        logger.error("louder");

        expect(warn).toHaveBeenCalledWith("[WARN]", "loud");
        expect(error).toHaveBeenCalledWith("[ERROR]", "louder");
    });

    it("raises visibility with configureLogger", () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        configureLogger("debug");
        logger.debug("visible now");

        expect(log).toHaveBeenCalledWith("[DEBUG]", "visible now");
    });

    it("an error-only threshold silences warnings", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        configureLogger("error");
        logger.warn("silenced");

        expect(warn).not.toHaveBeenCalled();
    });
});
