import { XPSettingsRepository } from "@database/repositories/XPSettingsRepository";

export async function isStaffChannel(guildId: string, channelId: string): Promise<boolean> {
    const settings = await XPSettingsRepository.get(guildId);
    if (!settings) return false;
    return settings.staffChannels.includes(channelId);
}
