import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { COLORS, MINECRAFT_STATUS_ICONS } from "@constants";
import type { IMinecraftServer } from "@database/models/MinecraftServer";

/** Rounds a byte-free megabyte figure for display, tolerating an absent reading. */
function megabytes(value: number | undefined): string {
    return value === undefined || value === null ? "—" : `${Math.round(value)} MB`;
}

/** Renders an uptime span the way the status panel already renders durations. */
export function formatUptime(milliseconds: number | undefined): string {
    if (!milliseconds || milliseconds < 1000) return "—";

    const days = Math.floor(milliseconds / 86_400_000);
    const hours = Math.floor((milliseconds % 86_400_000) / 3_600_000);
    const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

/**
 * The `!ip` card.
 *
 * The address is put on its own line in a code block rather than inline, because that is what
 * makes it tap-to-copy on mobile Discord — which is the entire point of the command.
 */
export function buildAddressEmbed(servers: IMinecraftServer[], fallbackAddress: string | null): EmbedBuilder {
    const primary = servers.find(server => server.address) ?? servers[0];
    const address = primary?.address ?? fallbackAddress ?? "Not configured";
    const port = primary?.port ?? 25565;

    const online = servers.filter(server => server.status === "ONLINE");
    const players = online.reduce((total, server) => total + server.onlinePlayers, 0);
    const capacity = online.reduce((total, server) => total + server.maxPlayers, 0);

    const versions = [...new Set(servers.flatMap(server => server.supportedVersions ?? []))];

    const embed = new EmbedBuilder()
        .setTitle("🌍 Server Address")
        .setColor(online.length > 0 ? COLORS.success : COLORS.error)
        .setDescription(`\`\`\`\n${address}\n\`\`\``)
        .addFields(
            { name: "Port", value: port === 25565 ? "25565 (default)" : String(port), inline: true },
            { name: "Status", value: online.length > 0 ? "🟢 Online" : "🔴 Offline", inline: true },
            { name: "Players", value: `${players} / ${capacity || "—"}`, inline: true },
        );

    if (versions.length > 0) {
        embed.addFields({ name: "Supported Versions", value: versions.join(", "), inline: false });
    }

    embed.setFooter({ text: "Tap the address above to copy it" }).setTimestamp();
    return embed;
}

/** The `!version` card. */
export function buildVersionEmbed(servers: IMinecraftServer[]): EmbedBuilder {
    const versions = [...new Set(servers.flatMap(server => server.supportedVersions ?? []))];
    const software = [...new Set(servers.map(server => server.software).filter(Boolean))];
    const java = [...new Set(servers.map(server => server.javaVersion).filter(Boolean))];
    const running = [...new Set(servers.map(server => server.version).filter(Boolean))];

    return new EmbedBuilder()
        .setTitle("🧩 Supported Versions")
        .setColor(COLORS.info)
        .addFields(
            {
                name: "Client Versions",
                value: versions.length > 0 ? versions.map(version => `• ${version}`).join("\n") : "Not configured",
                inline: false,
            },
            { name: "Running", value: running.join(", ") || "—", inline: true },
            { name: "Software", value: software.join(", ") || "—", inline: true },
            { name: "Java", value: java.join(", ") || "—", inline: true },
        )
        .setTimestamp();
}

/**
 * The `!status` card.
 *
 * One embed covering every server in the guild rather than one per server: a network with four
 * game servers would otherwise post four embeds for a command people run constantly.
 */
export function buildLiveStatusEmbed(servers: IMinecraftServer[]): EmbedBuilder {
    const embed = new EmbedBuilder().setTitle("📊 Server Status").setTimestamp();

    if (servers.length === 0) {
        return embed.setColor(COLORS.error).setDescription("No Minecraft servers are registered for this guild.");
    }

    const anyOnline = servers.some(server => server.status === "ONLINE");
    embed.setColor(anyOnline ? COLORS.success : COLORS.error);

    for (const server of servers) {
        const icon = MINECRAFT_STATUS_ICONS[server.status] ?? "⚪";

        const lines = [
            `${icon} **${server.status}**`,
            `👥 Players: **${server.onlinePlayers} / ${server.maxPlayers || "—"}**`,
            `⚡ TPS: **${server.tps !== undefined && server.tps !== null ? server.tps.toFixed(2) : "—"}**`,
            `💾 Memory: **${megabytes(server.memoryUsedMb)} / ${megabytes(server.memoryMaxMb)}**`,
            `🖥️ CPU: **${server.cpuPercent !== undefined && server.cpuPercent !== null ? `${server.cpuPercent.toFixed(1)}%` : "—"}**`,
            `⏱️ Uptime: **${formatUptime(server.uptimeMs)}**`,
            `🌐 World: **${server.world ?? "—"}**`,
            `🧩 ${server.software ?? server.version ?? "—"}`,
        ];

        if (server.startedAt) {
            lines.push(`🔄 Last restart: <t:${Math.floor(server.startedAt.getTime() / 1000)}:R>`);
        }

        embed.addFields({ name: server.displayName, value: lines.join("\n"), inline: true });
    }

    const address = servers.find(server => server.address)?.address;
    if (address) {
        embed.setDescription(`\`\`\`\n${address}\n\`\`\``);
    }

    return embed;
}

/**
 * The buttons shown under the status card.
 *
 * Only link buttons — a component with a custom id would need a handler that stays alive across a
 * bot restart, and these three targets are static.
 */
export function buildServerButtons(
    website: string | null,
    invite: string | null,
): ActionRowBuilder<ButtonBuilder>[] {
    const buttons: ButtonBuilder[] = [];

    if (website) {
        buttons.push(new ButtonBuilder().setLabel("Website").setStyle(ButtonStyle.Link).setURL(website));
    }

    if (invite) {
        buttons.push(new ButtonBuilder().setLabel("Discord").setStyle(ButtonStyle.Link).setURL(invite));
    }

    return buttons.length > 0 ? [new ActionRowBuilder<ButtonBuilder>().addComponents(buttons)] : [];
}
