import { describe, it, expect } from "vitest";
import { assertKnownProtocols } from "./assertKnownProtocols";

const registered = new Set(["wms", "xyz", "copc"]);

describe("assertKnownProtocols", () => {
    it("passes when no bindings exist", () => {
        expect(() => assertKnownProtocols([], registered)).not.toThrow();
    });

    it.each([
        ["a single known id", ["wms"]],
        ["several known ids", ["wms", "xyz", "copc"]],
        ["an empty list", []],
    ])("passes for %s", (_label, boundIds) => {
        expect(() =>
            assertKnownProtocols(boundIds as string[], registered),
        ).not.toThrow();
    });

    it("throws naming an unknown id", () => {
        expect(() =>
            assertKnownProtocols(["nope"], registered),
        ).toThrow(/unregistered protocols: "nope"/);
    });

    it("names every unknown id in one message", () => {
        expect(() =>
            assertKnownProtocols(["wms", "typo1", "typo2"], registered),
        ).toThrow(/"typo1", "typo2"/);
    });
});
