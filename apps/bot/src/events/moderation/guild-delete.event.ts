import { Events, type Guild } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { GlobalConfigRepository } from "@database/repositories";
import { removeServerLogChannels } from "@bot/utils/server-log";

const CTX = "moderation:guild-delete";

export default {
    name: Events.GuildDelete,
    async execute(guild: Guild, client: BotClient) {
        const logGuildId = await GlobalConfigRepository.get("server_log_guild");
        if (!logGuildId || logGuildId === guild.id) return;

        const logGuild = client.guilds.cache.get(logGuildId);
        if (!logGuild) return;

        try {
            const removed = await removeServerLogChannels(logGuild, guild.id);
            if (removed) {
                Logger.success(`Removed log category "${guild.id}" (bot was removed from "${guild.name ?? guild.id}")`, CTX);
            }
        } catch (err) {
            Logger.error(`Failed to remove log category for guild ${guild.id}: ${err}`, CTX);
        }
    },
};
