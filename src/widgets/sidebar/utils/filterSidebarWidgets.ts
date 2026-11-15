import type { WidgetInstance } from "@core/common/widget";

/**
 * Widgets the sidebar lists: grid-placed, not opted out via
 * `showInSidebar: false`, and not on the caller's exclusion list.
 */
export function filterSidebarWidgets(
    allWidgets: readonly WidgetInstance[],
    excludedIds: readonly string[],
): WidgetInstance[] {
    return allWidgets.filter(
        (instance) =>
            (instance.definition.placement ?? "grid") === "grid" &&
            instance.definition.showInSidebar !== false &&
            !excludedIds.includes(instance.id),
    );
}
