import { AllowedGuildRepository } from "@database/repositories";

/** Whether the bot is authorised to stay in this guild. Backed by the AllowedGuild collection, managed with `/addserver`. */
export async function isAllowedGuild(guildId: string): Promise<boolean> {
    return AllowedGuildRepository.isAllowed(guildId);
}
