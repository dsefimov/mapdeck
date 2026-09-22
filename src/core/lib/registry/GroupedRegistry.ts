/**
 * Grouped registry: `key → T[]`, with idempotent adds.
 *
 * Adding an item whose id already exists in the same group is a no-op
 * (silently ignored) — this is the ONLY place silent-skip is legitimate: it is
 * an idempotent group add, not a violation of id uniqueness. The same item id
 * in different groups is allowed.
 */
export class GroupedRegistry<T extends { id: string }> {
    private readonly _groups = new Map<string, T[]>();

    /** Append `item` to the group under `key` unless its id is already present. */
    add(key: string, item: T): void {
        const group = this._groups.get(key);
        if (!group) {
            this._groups.set(key, [item]);
            return;
        }
        if (!group.some((existing) => existing.id === item.id)) {
            group.push(item);
        }
    }

    /** The group's entries under `key`, or an empty array when absent. */
    get(key: string): T[] {
        return this._groups.get(key) ?? [];
    }

    /** Report whether a group exists under `key`. */
    has(key: string): boolean {
        return this._groups.has(key);
    }

    /** All group keys in insertion order. */
    keys(): string[] {
        return Array.from(this._groups.keys());
    }
}
