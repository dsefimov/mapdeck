/** Pure model of the select list: option identity, DOM ids, sectioning. */

export interface SelectOption {
    label: string;
    value: string;
    /** Consecutive options sharing a group render under one labeled section. */
    group?: string;
}

/** DOM id of the option at `index` — the aria-activedescendant target. */
export function optionDomId(id: string, index: number): string {
    return `${id}-option-${index}`;
}

/**
 * id the trigger's aria-activedescendant points at — the currently
 * highlighted option; the caller omits the attribute while closed or empty.
 */
export function activeDescendantId(
    id: string,
    itemCount: number,
    highlight: number,
): string | undefined {
    return itemCount > 0 ? optionDomId(id, highlight) : undefined;
}

/** One flat item with its index — the keyboard model stays flat. */
export interface OptionEntry {
    item: SelectOption;
    index: number;
}

/** Consecutive items sharing a group render as one labeled group. */
export interface ListSection {
    label?: string | undefined;
    entries: OptionEntry[];
}

/**
 * Groups items into renderable sections: a run of options with the same
 * group becomes one `[role="group"]`, ungrouped runs stay direct children
 * of the listbox.
 */
export function buildSections(items: SelectOption[]): ListSection[] {
    const sections: ListSection[] = [];
    items.forEach((item, index) => {
        const last = sections[sections.length - 1];
        if (last && last.label === item.group) {
            last.entries.push({ item, index });
        } else {
            sections.push({
                label: item.group,
                entries: [{ item, index }],
            });
        }
    });
    return sections;
}
