import { afterEach, describe, expect, it, vi } from "vitest";
import { parseUrl } from "./parseUrl";

describe("parseUrl", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("resolves a relative URL against a localhost stub without a document", () => {
        expect(parseUrl("/api/items").href).toBe("http://localhost/api/items");
    });

    it("resolves a relative URL against the document base when present", () => {
        vi.stubGlobal(
            "document",
            { baseURI: "https://page.example/app/" },
        );

        expect(parseUrl("api/x").href).toBe("https://page.example/app/api/x");
    });

    it("keeps absolute http and https URLs as-is", () => {
        expect(parseUrl("https://a.example/c?q=1").href).toBe(
            "https://a.example/c?q=1",
        );
        expect(parseUrl("http://b.example/").href).toBe("http://b.example/");
    });

    it("resolves against an explicit base", () => {
        expect(parseUrl("/x", "https://base.example/r/").href).toBe(
            "https://base.example/x",
        );
    });

    it("adopts the base protocol for a protocol-relative URL", () => {
        // "//host/path" inherits the scheme of the base it resolves
        // against — http(s) with any sane base, so it passes.
        expect(parseUrl("//cdn.example/x", "https://page.example/").href).toBe(
            "https://cdn.example/x",
        );
    });

    it.each(["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd"])(
        "throws on a non-HTTP(S) URL %s",
        (input) => {
            expect(() => parseUrl(input)).toThrow(/Unsupported URL protocol/);
        },
    );

    it("includes the offending URL in the protocol error", () => {
        expect(() => parseUrl("javascript:alert(1)")).toThrow(
            /javascript:alert\(1\)/,
        );
    });

    it("propagates the URL constructor's TypeError for unparseable input", () => {
        expect(() => parseUrl("https://exa mple")).toThrow(TypeError);
    });
});
