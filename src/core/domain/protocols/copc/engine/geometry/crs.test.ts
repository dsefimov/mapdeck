import { describe, expect, it } from "vitest";
import { extractProjcsFromWkt } from "./crs";

const PROJCS = 'PROJCS["UTM zone 33N",GEOGCS["WGS 84",DATUM["WGS_1984"]]]';
const VERTCS = 'VERT_CS["EGM96 height",VERT_DATUM["EGM96",2005]]';

describe("extractProjcsFromWkt", () => {
    it("leaves a plain horizontal system as it found it", () => {
        expect(extractProjcsFromWkt(PROJCS)).toBe(PROJCS);
    });

    it("lifts the horizontal system out of a compound one, dropping the vertical half", () => {
        const compound = `COMPD_CS["UTM 33N + EGM96",${PROJCS},${VERTCS}]`;

        expect(extractProjcsFromWkt(compound)).toBe(PROJCS);
    });

    it("counts brackets to find where the horizontal system ends, not the first close", () => {
        const compound = `COMPD_CS["combined",${PROJCS},${VERTCS}]`;

        const result = extractProjcsFromWkt(compound);

        expect(result.endsWith("]]]")).toBe(true);
        expect(result).not.toContain("VERT_CS");
    });

    it("hands back a compound system that carries no horizontal half", () => {
        const compound = `COMPD_CS["vertical only",${VERTCS}]`;

        expect(extractProjcsFromWkt(compound)).toBe(compound);
    });

    it("hands back a truncated string rather than a half-parsed system", () => {
        const truncated = 'COMPD_CS["broken",PROJCS["UTM zone 33N",GEOGCS["WGS 84"';

        expect(extractProjcsFromWkt(truncated)).toBe(truncated);
    });
});
