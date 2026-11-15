/**
 * Grouped registry: `key → T[]`.
 *
 * Re-adding an id already present in the group is a no-op — an
 * idempotent group add, not a violation of id uniqueness. The same
 * id in different groups is allowed.
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

    /** A copy of the group's entries under `key`; empty when absent. */
    get(key: string): readonly T[] {
        const group = this._groups.get(key);
        return group ? [...group] : [];
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
