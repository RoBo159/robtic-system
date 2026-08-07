import { MinecraftLinkRepository } from "@database/repositories";
import { Logger } from "@logger";
import { publishBridgeEvent } from "./publish-bridge-event";
import { resolveLuckPermsGroups } from "./resolve-luckperms-groups";

export interface UnlinkResult {
    unlinked: boolean;
    minecraftUsername?: string;
}

/**
 * Removes a link and revokes every Discord-managed LuckPerms group from the player — an unlinked
 * account must not keep permissions that came from Discord roles. Groups outside the guild's
 * mappings are left alone, as everywhere else in the sync.
 */
export async function unlinkAccount(guildId: string, discordId: string): Promise<UnlinkResult> {
    const link = await MinecraftLinkRepository.getByDiscordId(guildId, discordId);
    if (!link) return { unlinked: false };

    await MinecraftLinkRepository.delete(guildId, discordId);

    const groups = await resolveLuckPermsGroups(guildId, []);
    await publishBridgeEvent({
        guildId,
        type: "role_sync",
        serverKey: null,
        payload: {
            minecraftUuid: link.minecraftUuid,
            discordId,
            reason: "unlinked",
            grant: [],
            revoke: groups.managed,
            managed: groups.managed,
        },
    });

    Logger.info(`Unlinked Discord ${discordId} from ${link.minecraftUsername}`, "Minecraft");
    return { unlinked: true, minecraftUsername: link.minecraftUsername };
}
