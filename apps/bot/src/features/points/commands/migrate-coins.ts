import { EmbedBuilder, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, POINT_MESSAGES } from "@constants";
import { hasGuildBotAdmin } from "@bot/utils/access";
import { migrateCoinsToPoints, previewCoinMigration } from "@core/points";

/**
 * Claims this server's frozen pre-global coin balances as points, once.
 *
 * Reads the `LegacyCoin` archive, never the live wallet — coins are global now, so the live balance
 * is nobody's server's to convert and is also the Minecraft in-game money. Nothing in-game moves.
 *
 * Still behind an explicit confirm flag, because it is one-way for the server that runs it. Every
 * move lands in PointHistory under `coin-migration`.
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

    const guildId = interaction.guildId!;

    if (!interaction.options.getBoolean("confirm", true)) {
        const preview = await previewCoinMigration(guildId);

        if (preview.members === 0) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription(
                    "There is nothing left to claim — this server has either already run the migration, " +
                    "or had no coin balances when coins went global."
                )],
            });
            return;
        }

        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription(
                `This grants **${preview.pointsGranted}** points across **${preview.members}** member(s), ` +
                "from the coin balances this server had before coins became global.\n\n" +
                "Live coin balances and in-game money are **not** touched — those are global now and " +
                "start from zero.\n\nRe-run with `confirm: true` to proceed. It can only be done once."
            )],
        });
        return;
    }

    const result = await migrateCoinsToPoints(guildId, interaction.user.id);

    if (result.members === 0) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription(
                "Nothing to claim — this server has already run the migration."
            )],
        });
        return;
    }

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setDescription(
                `Granted **${result.pointsGranted}** points across **${result.members}** member(s) ` +
                "from this server's legacy coin balances.\n" +
                "Each grant is recorded in point history as `coin-migration`."
            )],
    });
};
