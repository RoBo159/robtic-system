import { EmbedBuilder } from "discord.js";
import { COLORS } from "@constants";
import type { MinecraftPriceEntry } from "@core/minecraft";

/** The guild's full ore-exchange price table, marking defaults and disabled items. */
export function buildPriceEmbed(guildName: string, entries: MinecraftPriceEntry[]): EmbedBuilder {
    const lines = entries.map(entry => {
        const flags = [
            entry.configured ? null : "default",
            entry.enabled ? null : "disabled",
        ].filter(Boolean);

        const suffix = flags.length ? ` _(${flags.join(", ")})_` : "";
        return `${entry.emoji} **${entry.label}** — \`${entry.price}\` 🪙${suffix}`;
    });

    return new EmbedBuilder()
        .setTitle("⛏️ Ore Exchange Prices")
        .setDescription(lines.join("\n") || "No sellable items configured.")
        .setFooter({ text: `${guildName} • coins paid per unit` })
        .setColor(COLORS.activity)
        .setTimestamp();
}
