import { describe, expect, it } from "vitest";
import { buildParentChildMap } from "./buildParentChildMap";

const PARENT = "0-0-0-0";
const OTHER_PARENT = "1-1-1-1";
const FIRST_CHILD = "1-0-0-0";
const SECOND_CHILD = "1-0-0-1";

describe("buildParentChildMap", () => {
    it("gathers children that share a parent into one block", () => {
        const result = buildParentChildMap(
            new Map([
                [FIRST_CHILD, PARENT],
                [SECOND_CHILD, PARENT],
            ]),
        );

        expect(result.get(PARENT)).toEqual(
            new Set([FIRST_CHILD, SECOND_CHILD]),
        );
    });

    it("keeps blocks apart, so one parent's budget never covers another's", () => {
        const result = buildParentChildMap(
            new Map([
                [FIRST_CHILD, PARENT],
                [SECOND_CHILD, OTHER_PARENT],
            ]),
        );

        expect(result.get(PARENT)).toEqual(new Set([FIRST_CHILD]));
        expect(result.get(OTHER_PARENT)).toEqual(new Set([SECOND_CHILD]));
    });

    it("produces nothing when the traversal recorded no fallbacks", () => {
        expect(buildParentChildMap(new Map()).size).toBe(0);
    });
});
