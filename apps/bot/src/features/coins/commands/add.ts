import { MessageFlags, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COIN_MESSAGES } from "@constants";
import { hasGuildBotAdmin } from "@bot/utils/access";
import { adjustBalance } from "../functions/adjust-balance";
import { resolveTarget } from "../utils/resolve-target";

/**
 * Gated here rather than by `access` on the command: Discord's permission model applies to a whole
 * command, and `/coins balance` has to stay open to everyone.
 */
export const add: FeatureSubcommandHandler = async (interaction, _client) => {
    const member = interaction.member as GuildMember | null;
    if (!interaction.guildId || !member) {
        await interaction.reply({ content: COIN_MESSAGES.guildOnly, flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!(await hasGuildBotAdmin(member))) {
        await interaction.editReply({ content: COIN_MESSAGES.adminOnly });
        return;
    }

    const target = await resolveTarget(interaction, true);
    const amount = interaction.options.getInteger("amount", true);

    const { total } = await adjustBalance(interaction.guildId, target.user.id, target.user.username, amount);

    await interaction.editReply({ content: COIN_MESSAGES.granted(target.displayName, amount, total) });
};
