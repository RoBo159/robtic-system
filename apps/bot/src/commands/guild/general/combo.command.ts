import { SlashCommandBuilder, ChatInputCommandInteraction, type GuildMember } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { buildStatusEmbed } from "@bot/utils/combo-embeds";
import { buildComboNavRow, isComboAdmin } from "@bot/utils/combo-components";
import { getUserLang, t } from "@bot/utils/lang";

export default {
    scope: "guild",
    access: "general",
    category: "Activity",
    data: new SlashCommandBuilder()
        .setName("combo")
        .setDescription("View your conversation combo status"),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
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

        const nav = buildComboNavRow(interaction.user.id, isAdmin);

        await interaction.editReply({ embeds: [embed], components: [nav] });
    },
};
