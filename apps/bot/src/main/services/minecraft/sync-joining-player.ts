import type { Client } from "discord.js";
import { MinecraftLinkRepository } from "@database/repositories";
import { syncMemberPermissions } from "@core/minecraft";
import { Logger } from "@logger";

interface JoinPayload {
    minecraftUuid?: string;
}

/**
 * Re-syncs a player's LuckPerms groups when they join the server. The plugin can't compute the
 * delta itself — it has no view of Discord roles — so the join event asks Discord to push one.
 */
export async function syncJoiningPlayer(
    client: Client,
    guildId: string,
    payload: Record<string, unknown>,
): Promise<void> {
    const { minecraftUuid } = payload as JoinPayload;
    if (!minecraftUuid) return;

    const link = await MinecraftLinkRepository.getByUuid(guildId, minecraftUuid);
    if (!link) return;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const member = await guild.members.fetch(link.discordId).catch(() => null);
    if (!member) {
        Logger.debug(`Linked player ${link.minecraftUsername} is no longer in the guild`, "Minecraft");
        return;
    }

    await syncMemberPermissions(member, "joined_server");
}
