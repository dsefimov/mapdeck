import type { RegisteredSetting, SettingsGroup } from "@core/contracts";

export function groupSettingsByOwner(
    settings: readonly RegisteredSetting[],
): SettingsGroup[] {
    const groupMap = new Map<string, SettingsGroup>();

    for (const setting of settings) {
        let group = groupMap.get(setting.ownerId);
        if (!group) {
            group = {
                ownerId: setting.ownerId,
                ownerName: setting.ownerName,
                settings: [],
            };
            groupMap.set(setting.ownerId, group);
        }
        group.settings.push(setting);
    }

    return Array.from(groupMap.values());
}
