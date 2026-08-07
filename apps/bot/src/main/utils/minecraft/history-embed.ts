import { EmbedBuilder } from "discord.js";
import { COLORS } from "@constants";
import type { IMinecraftTransaction } from "@database/models/MinecraftTransaction";
import { itemLabel } from "./item-label";

/** Recent ore-exchange sales, guild-wide or for one member. */
export function buildHistoryEmbed(title: string, transactions: IMinecraftTransaction[]): EmbedBuilder {
    const lines = transactions.map(sale =>
        `<t:${Math.floor(sale.createdAt.getTime() / 1000)}:R> — \`${sale.minecraftUsername}\` sold ` +
        `${itemLabel(sale.itemKey)} ×${sale.amount} for **${sale.coins}** 🪙 _(${sale.serverKey})_`
    );

    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(lines.join("\n") || "No transactions recorded yet.")
        .setColor(COLORS.activity)
        .setTimestamp();
}
