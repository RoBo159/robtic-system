import { MinecraftLinkRepository, RobsRepository } from "@database/repositories";
import { Logger } from "@logger";

export interface UnlinkResult {
    unlinked: boolean;
    minecraftUsername?: string;
}

/**
 * Removes a link.
 *
 * <h2>What this deliberately no longer does</h2>
 *
 * It used to queue a bridge event revoking every Discord-managed LuckPerms group, because Discord
 * roles were what granted them. That is inverted now: LuckPerms is the authority on who holds a
 * group, and unlinking a Discord account says nothing about whether someone is still staff on the
 * game server. Stripping their groups here would have let anyone demote themselves by unlinking.
 *
 * The player's robs are untouched for the same reason — robs belong to the Minecraft account, so
 * unlinking must not cost anything. Only the denormalised display copy of the Discord id is
 * cleared.
 */
export async function unlinkAccount(guildId: string, discordId: string): Promise<UnlinkResult> {
    const link = await MinecraftLinkRepository.getByDiscordId(guildId, discordId);
    if (!link) return { unlinked: false };

    await MinecraftLinkRepository.delete(guildId, discordId);
    await RobsRepository.attachDiscordId(link.minecraftUuid, null);

    Logger.info(`Unlinked Discord ${discordId} from ${link.minecraftUsername}`, "Minecraft");
    return { unlinked: true, minecraftUsername: link.minecraftUsername };
}
