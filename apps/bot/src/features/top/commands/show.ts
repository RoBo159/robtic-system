import type { GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { TOP_ALL_CATEGORIES, TOP_CATEGORIES, type TopCategory } from "@constants";
import { getUserLang, t } from "@bot/utils/lang";
import { buildTopScopeEmbed, buildTopPeriodRow, type TopScope } from "../utils";

/** Where a panel opens. Period is switchable from the menu; scope is fixed by how it was invoked. */
const DEFAULT_PERIOD = "daily" as const;

/** Accepts the category loosely, since `!top Combo` is what someone types. */
function resolveScope(input: string | null): TopScope | null {
    if (!input) return TOP_ALL_CATEGORIES;

    const wanted = input.trim().toLowerCase();
    if (wanted === TOP_ALL_CATEGORIES) return TOP_ALL_CATEGORIES;

    return TOP_CATEGORIES.find(c => c === (wanted as TopCategory)) ?? null;
}

export const show: FeatureSubcommandHandler = async (interaction, _client) => {
    await interaction.deferReply();

    const guild = interaction.guild;
    const lang = await getUserLang(interaction.member as GuildMember | null);

    if (!guild) {
        await interaction.editReply({ content: t("combo.guild_only", lang) });
        return;
    }

    const scope = resolveScope(interaction.options.getString("category"));
    if (!scope) {
        await interaction.editReply({
            content: t("top.unknown_category", lang, { categories: TOP_CATEGORIES.join(", ") }),
        });
        return;
    }

    const embed = await buildTopScopeEmbed(guild, scope, DEFAULT_PERIOD, lang, interaction.user.id);

    await interaction.editReply({
        embeds: [embed],
        components: [buildTopPeriodRow(interaction.user.id, scope, DEFAULT_PERIOD, lang)],
    });
};
