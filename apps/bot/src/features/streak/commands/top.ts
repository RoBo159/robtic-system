import type { GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { getUserLang } from "@bot/utils/lang";
import { getLeaderboard } from "../functions/get-leaderboard";
import { buildLeaderboardEmbed } from "../functions/build-leaderboard-embed";
import { buildStreakTopButtons } from "../utils/streak-top-buttons";

export const top: FeatureSubcommandHandler = async (interaction, _client) => {
    await interaction.deferReply();

    const guildId = interaction.guildId!;
    const lang = await getUserLang(interaction.member as GuildMember | null);
    const records = await getLeaderboard(guildId, "current");
    const embed = buildLeaderboardEmbed(interaction.guild!.name, "current", records, lang);

    await interaction.editReply({ embeds: [embed], components: [buildStreakTopButtons("current", lang)] });
};
