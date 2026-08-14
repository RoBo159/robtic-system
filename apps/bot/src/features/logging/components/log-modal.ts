import {
    type ModalSubmitInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { COLORS, LOG_REGISTRY, LOG_SETUP_MESSAGES, type LogKey } from "@constants";
import { LogConfigRepository } from "@database/repositories";

const setupLogModalHandler: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^setup_log_modal_.+$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const key = interaction.customId.replace("setup_log_modal_", "") as LogKey;
        const meta = LOG_REGISTRY[key];

        const channelId = interaction.fields.getTextInputValue("channel_id").trim();
        const rawServerId = interaction.fields.getTextInputValue("server_id")?.trim();
        const serverId = rawServerId || interaction.guildId!;

        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setDescription(LOG_SETUP_MESSAGES.botNotInServer(serverId)).setColor(COLORS.error)],
            });
            return;
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel?.isTextBased()) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setDescription(LOG_SETUP_MESSAGES.channelNotFound(channelId, guild.name)).setColor(COLORS.error)],
            });
            return;
        }

        const previous = await LogConfigRepository.findByKey(key);
        await LogConfigRepository.upsert(key, serverId, channelId, interaction.user.id);

        const embed = new EmbedBuilder()
            .setTitle(previous ? LOG_SETUP_MESSAGES.updatedTitle : LOG_SETUP_MESSAGES.configuredTitle)
            .setColor(COLORS.success)
            .addFields(
                { name: LOG_SETUP_MESSAGES.logTypeFieldName, value: meta.label, inline: true },
                { name: LOG_SETUP_MESSAGES.serverFieldName, value: guild.name, inline: true },
                { name: LOG_SETUP_MESSAGES.channelFieldName, value: `<#${channelId}>`, inline: true },
            );

        if (previous) {
            const prevGuild = client.guilds.cache.get(previous.serverId);
            embed.addFields({
                name: LOG_SETUP_MESSAGES.previousFieldName,
                value: `${prevGuild?.name ?? previous.serverId} — <#${previous.channelId}>`,
                inline: false,
            });
        }

        embed.setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

export default setupLogModalHandler;
