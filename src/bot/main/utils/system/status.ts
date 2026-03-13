import type { ClientManager } from "@core/ClientManager";
import { BOT_DEFINITIONS, Colors } from "@core/config";
import { formatDuration } from "@core/utils";
import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";

export async function systemStatus(interaction: ChatInputCommandInteraction, manager: ClientManager) {
    await interaction.deferReply();

    const statuses = manager.getAllStatuses();

    const embed = new EmbedBuilder()
        .setTitle("🖥️ System Status")
        .setColor(Colors.info)
        .setTimestamp()
        .setDescription(
            `**Active Bots:** ${manager.getActiveCount()}/${BOT_DEFINITIONS.length}`
        );

    for (const status of statuses) {
        const indicator = status.online ? "🟢" : "🔴";
        const uptime = status.uptime ? formatDuration(status.uptime) : "N/A";

        embed.addFields({
            name: `${indicator} ${status.name.toUpperCase()}`,
            value: [
                `Status: ${status.online ? "Online" : "Offline"}`,
                `Ping: ${status.ping}ms`,
                `Guilds: ${status.guilds}`,
                `Uptime: ${uptime}`,
                `Modules: ${status.modulesLoaded.join(", ") || "None"}`,
            ].join("\n"),
            inline: true,
        });
    }

    await interaction.editReply({ embeds: [embed] });
}