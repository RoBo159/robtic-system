import type { GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { getUserLang, t } from "@bot/utils/lang";
import { buildTopEmbed } from "../functions/build-top-embed";
import { buildTopCategoryRow, buildTopPeriodRow } from "../utils";

/** Where the panel opens; both selects change it from there. */
const DEFAULT_CATEGORY = "streak" as const;
const DEFAULT_PERIOD = "daily" as const;

export const show: FeatureSubcommandHandler = async (interaction, _client) => {
    await interaction.deferReply();

    const guild = interaction.guild;
    const lang = await getUserLang(interaction.member as GuildMember | null);

    if (!guild) {
        await interaction.editReply({ content: t("combo.guild_only", lang) });
        return;
    }

    const embed = await buildTopEmbed(guild, DEFAULT_CATEGORY, DEFAULT_PERIOD, lang, interaction.user.id);

    await interaction.editReply({
        embeds: [embed],
        components: [
            buildTopCategoryRow(interaction.user.id, DEFAULT_CATEGORY, DEFAULT_PERIOD, lang),
            buildTopPeriodRow(interaction.user.id, DEFAULT_CATEGORY, DEFAULT_PERIOD, lang),
        ],
    });
};
