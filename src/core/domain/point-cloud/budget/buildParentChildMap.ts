/**
 * Build parent → children mapping from fallback map.
 *
 * Input:  Map<childKey, parentKey>
 * Output: Map<parentKey, Set<childKey>>
 *
 * Pure function — deterministic, no side effects.
 * Used by the budget planner to reserve atomic sibling blocks.
 */
export function buildParentChildMap(
    fallbacks: ReadonlyMap<string, string>,
): Map<string, Set<string>> {
    const parentToChildren = new Map<string, Set<string>>();
    for (const [childKey, parentKey] of fallbacks) {
        let children = parentToChildren.get(parentKey);
        if (!children) {
            children = new Set<string>();
            parentToChildren.set(parentKey, children);
        }
        children.add(childKey);
    }
    return parentToChildren;
}
