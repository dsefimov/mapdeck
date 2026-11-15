import {
    type SettingsGroup,
    LOCALE_KEY_TOOL_NAME,
    LOCALE_KEY_WIDGET_NAME,
} from "@core/contracts";

/**
 * Resolves the localized display name of a settings group owner: the
 * widget name, then the tool name, then the raw owner name as fallback.
 * Pure — the `t` locale lookup is passed in.
 */
export function resolveOwnerName(
    t: (namespace: string) => Record<string, string | undefined>,
    group: SettingsGroup,
): string {
    return (
        t(group.ownerId)[LOCALE_KEY_WIDGET_NAME] ??
        t(group.ownerId)[LOCALE_KEY_TOOL_NAME] ??
        group.ownerName
    );
}
