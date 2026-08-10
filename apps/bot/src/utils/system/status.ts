import type { ClientManager } from "@core/client-manager";
import { COLORS } from "@constants";
import { buildSystemStatusEmbed, configureStatusPanel, getConfiguredStatusPanel, registerStatusClient } from "@core/status/status";
import { formatDuration } from "@utils";
import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";

export async function systemStatus(interaction: ChatInputCommandInteraction, manager: ClientManager) {
    await interaction.deferReply();
    registerStatusClient(interaction.client);

    const selectedChannel = interaction.options.getChannel("channel");

    if (selectedChannel) {
        if (!interaction.guildId) {
            await interaction.editReply({ content: "This command can only be used in a guild." });
            return;
        }

        try {
            await configureStatusPanel(interaction.guildId, selectedChannel.id, interaction.user.id, interaction.client);
            await interaction.editReply({
                content: `✅ Status panel has been configured in <#${selectedChannel.id}> and will auto-update on bot/server/database events.`,
            });
        } catch (error) {
            await interaction.editReply({
                content: `❌ Failed to configure status panel: ${String(error)}`,
            });
        }
        return;
    }

    if (interaction.guildId) {
        const configuredPanel = await getConfiguredStatusPanel(interaction.guildId);
        if (!configuredPanel) {
            await interaction.editReply({
                content: "No status channel configured. Use `/system status channel:#your-channel` first.",
            });
            return;
        }

        const liveEmbed = await buildSystemStatusEmbed();
        await interaction.editReply({
            content: `Current status panel: <#${configuredPanel.channelId}>`,
            embeds: [liveEmbed],
        });
        return;
    }

    const status = manager.getStatus();

    const embed = new EmbedBuilder()
        .setTitle("🖥️ System Status")
        .setColor(COLORS.info)
        .setTimestamp()
        .addFields({
            name: `${status.online ? "🟢" : "🔴"} ${status.name.toUpperCase()}`,
            value: [
                `Status: ${status.online ? "Online" : "Offline"}`,
                `Ping: ${status.ping}ms`,
                `Guilds: ${status.guilds}`,
                `Uptime: ${status.uptime ? formatDuration(status.uptime) : "N/A"}`,
                `Commands: ${status.commands}`,
            ].join("\n"),
            inline: true,
        });

    await interaction.editReply({ embeds: [embed] });
}
