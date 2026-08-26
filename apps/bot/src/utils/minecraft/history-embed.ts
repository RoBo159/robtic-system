import { EmbedBuilder } from "discord.js";
import { COLORS, formatRobs } from "@constants";
import type { IRobTransaction } from "@database/models/RobTransaction";
import { itemLabel } from "./item-label";

/** Recent ore-exchange sales, guild-wide or for one player. Paid in robs, not Discord coins. */
export function buildHistoryEmbed(title: string, transactions: IRobTransaction[]): EmbedBuilder {
    const lines = transactions.map(sale =>
        `<t:${Math.floor(sale.createdAt.getTime() / 1000)}:R> — \`${sale.minecraftUsername}\` sold ` +
        `${itemLabel(sale.itemKey)} ×${sale.amount} for **${formatRobs(sale.robs)}** robs _(${sale.serverKey})_`
    );

    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(lines.join("\n") || "No transactions recorded yet.")
        .setColor(COLORS.activity)
        .setTimestamp();
}
