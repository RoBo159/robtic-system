import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { ShortcutRepository } from "@database/repositories";
import { resolveTrigger, knownTriggers } from "../utils/resolve-trigger";

export const remove: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const typed = interaction.options.getString("trigger", true);

    const trigger = await resolveTrigger(guildId, typed);
    const removed = await ShortcutRepository.remove(guildId, trigger);

    if (!removed) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(
                `No shortcut called **${typed.trim()}**.\n${await knownTriggers(guildId)}`
            )],
        });
        return;
    }

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setDescription(`Removed **${removed.trigger}** — it no longer runs \`${removed.command}\`.`)],
    });
};
