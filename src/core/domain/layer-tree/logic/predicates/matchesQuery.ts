import type { TreeNode } from "@core/contracts";

/**
 * Creates a predicate function that checks whether a TreeNode matches the
 * given search query (case-insensitive): the node's title or description, or
 * the title or description of any of its report-type related objects.
 *
 * @param query - Search query (case-insensitive)
 * @returns Predicate function for filtering tree nodes
 */
export function matchesQuery(query: string): (node: TreeNode) => boolean {
    const q = query.toLowerCase();
    return (node: TreeNode): boolean => {
        if (
            node.title.toLowerCase().includes(q) ||
            node.description.toLowerCase().includes(q)
        ) {
            return true;
        }
        return node.relatedObjects.some(
            (obj) =>
                obj.type === "report" &&
                (obj.title.toLowerCase().includes(q) ||
                    (obj.description ?? "").toLowerCase().includes(q)),
        );
    };
}
