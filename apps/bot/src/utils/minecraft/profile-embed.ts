import { EmbedBuilder, type User } from "discord.js";
import { COLORS } from "@constants";
import type { MinecraftProfile } from "@core/minecraft";
import { itemLabel } from "./item-label";

function timestamp(date?: Date): string {
    return date ? `<t:${Math.floor(date.getTime() / 1000)}:R>` : "—";
}

/** Link state, shared coin balance, and recent sales for one member. */
export function buildProfileEmbed(target: User, displayName: string, profile: MinecraftProfile): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle(`⛏️ Minecraft — ${displayName}`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .setColor(profile.linked ? COLORS.activity : COLORS.warning)
        .setTimestamp();

    if (!profile.linked) {
        return embed.setDescription(
            "This account is not linked yet.\n\n" +
            "Run `/link` on the Minecraft server, then `/minecraft link <code>` here."
        );
    }

    const sales = profile.recentSales.length
        ? profile.recentSales
            .map(sale => `${itemLabel(sale.itemKey)} ×${sale.amount} → **${sale.coins}** 🪙 ${timestamp(sale.createdAt)}`)
            .join("\n")
        : "No sales yet";

    return embed.addFields(
        { name: "Minecraft", value: `\`${profile.minecraftUsername}\``, inline: true },
        { name: "Balance", value: `**${profile.coins}** 🪙`, inline: true },
        { name: "Linked", value: timestamp(profile.linkedAt), inline: true },
        {
            name: "Exchange totals",
            value:
                `Sales: \`${profile.totals.transactions}\`\n` +
                `Items sold: \`${profile.totals.items}\`\n` +
                `Coins earned: \`${profile.totals.coins}\``,
            inline: true,
        },
        { name: "Last seen in-game", value: timestamp(profile.lastSeenAt), inline: true },
        { name: "Recent sales", value: sales },
    );
}
