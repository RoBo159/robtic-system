import { XPSettingsRepository } from "@database/repositories/XPSettingsRepository";
import { Logger } from "@logger";

const CTX = "community:xp";

export async function isXPChannel(guildId: string, channelId: string): Promise<boolean> {
    const settings = await XPSettingsRepository.get(guildId);
    if (!settings) {
        Logger.debug(`No XP settings found for guild ${guildId}`, CTX);
        return false;
    }
    const result = settings.chatChannels.includes(channelId);
    Logger.debug(`Channel ${channelId} isXPChannel: ${result}`, CTX);
    return result;
}
