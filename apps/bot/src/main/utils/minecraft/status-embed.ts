import { EmbedBuilder } from "discord.js";
import { COLORS, MINECRAFT_STATUS_ICONS, type MinecraftServerState } from "@constants";
import type { IMinecraftServer } from "@database/models/MinecraftServer";
import { formatDuration } from "@utils";

const STATE_COLORS: Record<MinecraftServerState, number> = {
    ONLINE: COLORS.success,
    OFFLINE: COLORS.error,
    RESTARTING: COLORS.warning,
    CRASHED: COLORS.moderation,
};

/** Worst state across the guild's servers decides the embed colour. */
function overallState(servers: IMinecraftServer[]): MinecraftServerState {
    const order: MinecraftServerState[] = ["CRASHED", "OFFLINE", "RESTARTING", "ONLINE"];
    return order.find(state => servers.some(server => server.status === state)) ?? "OFFLINE";
}

function serverField(server: IMinecraftServer): { name: string; value: string; inline: boolean } {
    const icon = MINECRAFT_STATUS_ICONS[server.status];
    const uptime = server.status === "ONLINE" && server.startedAt
        ? formatDuration(Date.now() - server.startedAt.getTime())
        : "—";

    return {
        name: `${icon} ${server.displayName}`,
        value: [
            `Status: **${server.status}**`,
            `Players: \`${server.onlinePlayers}/${server.maxPlayers}\``,
            `Version: \`${server.version}\``,
            `Uptime: ${uptime}`,
            `Updated: <t:${Math.floor(server.lastHeartbeatAt.getTime() / 1000)}:R>`,
        ].join("\n"),
        inline: true,
    };
}

/** The auto-refreshed panel listing every registered Minecraft server in the guild. */
export function buildServerStatusEmbed(servers: IMinecraftServer[]): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle("🎮 Minecraft Servers")
        .setColor(servers.length ? STATE_COLORS[overallState(servers)] : COLORS.info)
        .setFooter({ text: "Robtic Minecraft Integration" })
        .setTimestamp();

    if (servers.length === 0) {
        return embed.setDescription("No Minecraft server has reported in yet.");
    }

    const totalOnline = servers.reduce((sum, server) => sum + (server.status === "ONLINE" ? server.onlinePlayers : 0), 0);
    return embed
        .setDescription(`**${totalOnline}** player(s) online across **${servers.length}** server(s).`)
        .addFields(servers.map(serverField));
}
