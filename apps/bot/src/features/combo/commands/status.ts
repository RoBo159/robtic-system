import type { GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { getUserLang, t } from "@bot/utils/lang";
import { buildStatusEmbed } from "../utils/combo-embeds";
import { buildComboNavRow, isComboAdmin } from "../utils/combo-components";

export const status: FeatureSubcommandHandler = async (interaction, _client) => {
    await interaction.deferReply();

    const guild = interaction.guild;
    const lang = await getUserLang(interaction.member as GuildMember | null);

    if (!guild) {
        await interaction.editReply({ content: t("combo.guild_only", lang) });
        return;
    }

    const member = interaction.member as GuildMember | null;
    const isAdmin = await isComboAdmin(interaction.user.id, member);

    const embed = await buildStatusEmbed(guild, {
        id: interaction.user.id,
        username: interaction.user.username,
        avatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
    }, lang);

    await interaction.editReply({ embeds: [embed], components: [buildComboNavRow(interaction.user.id, isAdmin)] });
};
