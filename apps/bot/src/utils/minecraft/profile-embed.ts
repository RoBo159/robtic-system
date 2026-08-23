import { EmbedBuilder, type User } from "discord.js";
import { COLORS } from "@constants";
import type { MinecraftProfile } from "@core/minecraft";
import { itemLabel } from "./item-label";

function timestamp(date?: Date): string {
    return date ? `<t:${Math.floor(date.getTime() / 1000)}:R>` : "—";
}

function absolute(date?: Date): string {
    return date ? `<t:${Math.floor(date.getTime() / 1000)}:D>` : "—";
}

/** "3d 4h", "12h 30m", "45m". Zero reads as "0m" rather than an empty string. */
function duration(millis: number): string {
    const totalMinutes = Math.floor(Math.max(0, millis) / 60_000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

/**
 * `/minecraft profile` — link state, premium, statistics and recent sales.
 *
 * <h2>Home coordinates are never shown</h2>
 *
 * Only the count and the limit. The data layer does not return locations at all, so this could not
 * display them by accident — but it is worth saying here too, because "show them where their homes
 * are" is an obvious-sounding feature request and it is the wrong one: a Discord channel is public
 * and a base location is not.
 */
export function buildProfileEmbed(target: User, displayName: string, profile: MinecraftProfile): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(`⛏️ Minecraft — ${displayName}`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setColor(profile.linked ? COLORS.activity : COLORS.warning)
        .setTimestamp();

    if (!profile.linked) {
        return embed.setDescription(
            "**This account is not linked yet.**\n\n" +
            "Linking connects your Minecraft account to Discord so your rank, premium and profile " +
            "show up here.\n\n" +
            "**How to link**\n" +
            "1. Join the Minecraft server and run `/link`\n" +
            "2. It gives you a one-time code\n" +
            "3. Come back here and run `/minecraft link <code>`\n\n" +
            "_Your robs, homes and friends all work in game without linking — linking is only " +
            "what connects the two accounts._"
        );
    }

    const jail = profile.jailed
        ? profile.jailRemainingMs === null
            ? "🔒 Jailed — permanent"
            : `🔒 Jailed — ${duration(profile.jailRemainingMs)} left`
        : "🔓 Not jailed";

    const sales = profile.recentSales.length
        ? profile.recentSales
            .map(sale => `${itemLabel(sale.itemKey)} ×${sale.amount} → **${sale.robs}** robs ${timestamp(sale.createdAt)}`)
            .join("\n")
        : "No sales yet";

    return embed.addFields(
        { name: "Minecraft", value: `\`${profile.minecraftUsername}\``, inline: true },
        { name: "UUID", value: `\`${profile.minecraftUuid}\``, inline: true },
        { name: "Premium", value: profile.premium.tierName ?? "None", inline: true },

        { name: "Robs", value: `**${profile.robs}**`, inline: true },
        { name: "Kills / Deaths", value: `${profile.kills} / ${profile.deaths}`, inline: true },
        { name: "Homes", value: `${profile.homesUsed}/${profile.homeLimit}`, inline: true },

        { name: "Playtime", value: duration(profile.playtimeMs), inline: true },
        { name: "First join", value: absolute(profile.firstJoinAt), inline: true },
        { name: "Last seen", value: timestamp(profile.lastSeenAt), inline: true },

        { name: "Friends", value: String(profile.friendCount), inline: true },
        { name: "Times jailed", value: String(profile.jailCount), inline: true },
        { name: "Status", value: jail, inline: true },

        {
            name: "Exchange totals",
            value:
                `Sales: \`${profile.totals.transactions}\`\n` +
                `Items sold: \`${profile.totals.items}\`\n` +
                `Robs earned: \`${profile.totals.robs}\``,
            inline: true,
        },
        { name: "Linked", value: timestamp(profile.linkedAt), inline: true },
        { name: "Recent sales", value: sales },
    );
}
