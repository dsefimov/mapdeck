/**
 * Deep structural equality for JSON-like data: primitives, plain
 * objects, arrays and Dates. Any other object compares by reference.
 * Cyclic structures are not supported.
 * @param a - left value
 * @param b - right value
 * @returns true when both values are structurally equal
 */
export function structuralEquals(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;

    if (a instanceof Date || b instanceof Date) {
        return datesEqual(a, b);
    }

    if (Array.isArray(a) || Array.isArray(b)) {
        return arraysEqual(a, b);
    }

    if (isPlainObject(a) && isPlainObject(b)) {
        return plainObjectsEqual(a, b);
    }

    return false;
}

function datesEqual(a: unknown, b: unknown): boolean {
    return (
        a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );
}

function arraysEqual(a: unknown, b: unknown): boolean {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    return (
        a.length === b.length &&
        a.every((item, i) => structuralEquals(item, b[i]))
    );
}

function plainObjectsEqual(
    a: Record<string, unknown>,
    b: Record<string, unknown>,
): boolean {
    const keysA = Object.keys(a);
    return (
        keysA.length === Object.keys(b).length &&
        keysA.every(
            (key) => Object.hasOwn(b, key) && structuralEquals(a[key], b[key]),
        )
    );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
