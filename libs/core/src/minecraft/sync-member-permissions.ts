import type { GuildMember } from "discord.js";
import { MinecraftConfigRepository, MinecraftLinkRepository } from "@database/repositories";
import { Logger } from "@logger";
import { publishBridgeEvent } from "./publish-bridge-event";
import { resolveLuckPermsGroups } from "./resolve-luckperms-groups";

/**
 * Pushes a linked member's Discord roles to the game server as a LuckPerms group delta. Returns
 * false when the guild has role sync off, the member isn't linked, or nothing is mapped — all
 * ordinary states, not errors.
 */
export async function syncMemberPermissions(member: GuildMember, reason: string): Promise<boolean> {
    const config = await MinecraftConfigRepository.get(member.guild.id);
    if (!config?.roleSyncEnabled || config.roleMappings.length === 0) return false;

    const link = await MinecraftLinkRepository.getByDiscordId(member.guild.id, member.id);
    if (!link) return false;

    const groups = await resolveLuckPermsGroups(member.guild.id, [...member.roles.cache.keys()]);

    const published = await publishBridgeEvent({
        guildId: member.guild.id,
        type: "role_sync",
        serverKey: null,
        payload: {
            discordId: member.id,
            minecraftUuid: link.minecraftUuid,
            reason,
            grant: groups.grant,
            revoke: groups.revoke,
            managed: groups.managed,
        },
    });

    if (published) {
        Logger.debug(
            `Queued LuckPerms sync for ${link.minecraftUsername} (${reason}): +[${groups.grant.join(", ")}] -[${groups.revoke.join(", ")}]`,
            "Minecraft",
        );
    }

    return published;
}
