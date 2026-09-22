// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "./download";

describe("downloadFile blob URL lifetime", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("revokes the object URL only after a delay (Safari/Firefox)", async () => {
        vi.useFakeTimers();
        const revoke = vi.fn();
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download-test");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(revoke);
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                blob: () => Promise.resolve(new Blob(["data"])),
            }),
        );

        const done = downloadFile("https://example.com/report.pdf", "r.pdf");
        await vi.advanceTimersByTimeAsync(500);
        expect(revoke).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(600);
        expect(revoke).toHaveBeenCalledWith("blob:download-test");
        await done;
        vi.unstubAllGlobals();
    });
});
