import { Events, type Guild } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { GlobalConfigRepository } from "@database/repositories";
import { ensureServerLogChannels } from "@bot/utils/server-log";

const CTX = "moderation:guild-create";

export default {
    name: Events.GuildCreate,
    async execute(guild: Guild, client: BotClient) {
        const logGuildId = await GlobalConfigRepository.get("server_log_guild");
        if (!logGuildId || logGuildId === guild.id) return;

        const logGuild = client.guilds.cache.get(logGuildId);
        if (!logGuild) {
            Logger.warn(
                `Joined guild "${guild.name}" (${guild.id}) but the configured log guild (${logGuildId}) isn't available — skipping log auto-setup.`,
                CTX
            );
            return;
        }

        try {
            await ensureServerLogChannels(logGuild, guild.id, guild.name);
            Logger.success(`Log channels ready for "${guild.name}" (${guild.id})`, CTX);
        } catch (err) {
            Logger.error(`Failed to auto-provision log category/channels for guild ${guild.id}: ${err}`, CTX);
        }
    },
};
