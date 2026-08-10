import {
    type ModalSubmitInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { COLORS } from "@constants";
import { ServerConfigRepository } from "@database/repositories";

const MOD_CHANNEL_LABELS: Record<string, string> = {
    modmail: "ModMail Channel",
};

const setModChannelModalHandler: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^set_mod_channel_modal_.+$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const type = interaction.customId.replace("set_mod_channel_modal_", "");
        const label = MOD_CHANNEL_LABELS[type] ?? type;

        const channelId = interaction.fields.getTextInputValue("channel_id").trim();
        const rawServerId = interaction.fields.getTextInputValue("server_id")?.trim();
        const serverId = rawServerId || interaction.guildId!;

        const guild = client.guilds.cache.get(serverId);
        if (!guild) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setDescription(`❌ Bot is not in server \`${serverId}\`.`).setColor(COLORS.error)],
            });
            return;
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel?.isTextBased()) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setDescription(`❌ Channel \`${channelId}\` not found or is not a text channel in **${guild.name}**.`).setColor(COLORS.error)],
            });
            return;
        }

        if (type === "modmail") {
            await ServerConfigRepository.setModmailChannel(serverId, channelId);
        }

        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle("✅ Mod Channel Configured")
                    .setColor(COLORS.success)
                    .addFields(
                        { name: "Type", value: label, inline: true },
                        { name: "Server", value: guild.name, inline: true },
                        { name: "Channel", value: `<#${channelId}>`, inline: true },
                    )
                    .setTimestamp()
            ],
        });
    },
};

export default setModChannelModalHandler;
