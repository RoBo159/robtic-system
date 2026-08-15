import { EmbedBuilder, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, POINT_MESSAGES } from "@constants";
import { hasGuildBotAdmin } from "@bot/utils/access";
import { migrateCoinsToPoints } from "@core/points";

/**
 * Moves legacy coin balances into points, once, on request.
 *
 * Behind an explicit confirm flag and never run automatically: it zeroes the coin balances it
 * moves, and coins are also the Minecraft in-game wallet, so this is an operator's decision rather
 * than something a restart should do. Every move lands in PointHistory under `coin-migration`,
 * so it can be audited or undone.
 */
export const migrateCoins: FeatureSubcommandHandler = async (interaction, _client) => {
    const member = interaction.member as GuildMember | null;
    if (!member) {
        await interaction.editReply({ content: POINT_MESSAGES.guildOnly });
        return;
    }

    if (!(await hasGuildBotAdmin(member))) {
        await interaction.editReply({ content: POINT_MESSAGES.adminOnly });
        return;
    }

    if (!interaction.options.getBoolean("confirm", true)) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription(
                "This copies every member's coin balance into points and then **sets their coin balance to zero**.\n" +
                "Coins are also the Minecraft in-game wallet, so run it only if that is what you want.\n\n" +
                "Re-run with `confirm: true` to proceed."
            )],
        });
        return;
    }

    const result = await migrateCoinsToPoints(interaction.guildId!, interaction.user.id);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setDescription(
                `Moved **${result.pointsGranted}** coins into points across **${result.members}** member(s).\n` +
                "Each move is recorded in point history as `coin-migration`."
            )],
    });
};
