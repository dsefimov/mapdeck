/**
 * Deep structural equality for JSON-like data: primitives, plain
 * objects, arrays and Dates. Any other object kind compares by its own
 * enumerable string keys; anything else compares by identity.
 * @param a - left value
 * @param b - right value
 * @returns true when both values are structurally equal
 */
export function structuralEquals(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;

    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }

    if (Array.isArray(a) && Array.isArray(b)) {
        return (
            a.length === b.length &&
            a.every((item, i) => structuralEquals(item, b[i]))
        );
    }

    if (isStructuralObject(a) && isStructuralObject(b)) {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        return (
            keysA.length === keysB.length &&
            keysA.every(
                (key) =>
                    key in b && structuralEquals(a[key], b[key]),
            )
        );
    }

    return false;
}

function isStructuralObject(
    value: unknown,
): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
