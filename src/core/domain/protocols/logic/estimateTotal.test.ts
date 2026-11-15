import { describe, expect, it } from "vitest";

import { estimateTotal } from "./estimateTotal";

describe("estimateTotal", () => {
    it.each([
        {
            case: "number wins over the heuristic",
            matched: 1234,
            count: 50,
            offset: 0,
            pageSize: 50,
            expected: 1234,
        },
        {
            case: "numeric string is coerced",
            matched: "42",
            count: 50,
            offset: 0,
            pageSize: 50,
            expected: 42,
        },
        {
            case: "zero is a valid precise total",
            matched: 0,
            count: 0,
            offset: 0,
            pageSize: 50,
            expected: 0,
        },
    ])(
        "$case",
        ({ matched, count, offset, pageSize, expected }) => {
            expect(estimateTotal(matched, count, offset, pageSize)).toBe(
                expected,
            );
        },
    );

    it.each([
        ["null counts as not reported", null],
        ["undefined counts as not reported", undefined],
        ["non-numeric string counts as not reported", "many"],
        ["empty string counts as not reported (Number(\"\") would be 0)", ""],
        ["whitespace string counts as not reported", "  "],
    ])("%s — full page fabricates offset+count+1", (_case, matched) => {
        expect(estimateTotal(matched, 500, 500, 500)).toBe(1001);
    });

    it.each([
        ["null counts as not reported", null],
        ["undefined counts as not reported", undefined],
    ])("%s — short last page totals offset+count", (_case, matched) => {
        expect(estimateTotal(matched, 37, 500, 500)).toBe(537);
    });
});
