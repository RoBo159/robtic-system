import { type ButtonInteraction, type GuildMember } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import { getLeaderboard, buildLeaderboardEmbed, type LeaderboardMode } from "../services/streak-service";
import { buildStreakTopButtons } from "../commands/streak-top";
import { getUserLang } from "@bot/utils/lang";

export const streakTopToggleHandler: ComponentHandler<ButtonInteraction> = {
    customId: /^streak-top-(current|best)$/,

    async run(interaction: ButtonInteraction) {
        const mode = interaction.customId.split("-")[2] as LeaderboardMode;
        const guildId = interaction.guildId!;
        const lang = await getUserLang(interaction.member as GuildMember | null);

        const records = await getLeaderboard(guildId, mode);
        const embed = buildLeaderboardEmbed(interaction.guild!.name, mode, records, lang);

        await interaction.update({ embeds: [embed], components: [buildStreakTopButtons(mode, lang)] });
    },
};
