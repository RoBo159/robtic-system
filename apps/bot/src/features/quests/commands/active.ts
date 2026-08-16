import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, type QuestTier } from "@constants";
import { QuestClaimRepository, QuestRepository } from "@database/repositories";
import { tierTitle, missionProgressLines } from "../utils/quest-lines";

/**
 * The quests this member is currently on.
 *
 * At most three — one per slot — so every claim is fetched individually rather than aggregated.
 */
export const active: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const claims = await QuestClaimRepository.findActiveForMember(guildId, interaction.user.id);

    if (claims.length === 0) {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle("No active quests")
                .setColor(COLORS.info)
                .setDescription("Nothing claimed right now — `/quest board` shows what is open.")],
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("Your active quests")
        .setColor(COLORS.activity)
        .setFooter({ text: "Progress updates on its own — there is nothing to run." });

    for (const claim of claims) {
        const quest = await QuestRepository.findById(claim.questId);
        const reward = quest?.reward ?? 0;
        const doneCount = claim.missions.filter(
            mission => (claim.progress?.[mission.missionId] ?? 0) >= mission.target
        ).length;

        embed.addFields({
            name: `${tierTitle(claim.tier as QuestTier)} — ${doneCount}/${claim.missions.length} done`,
            value:
                `${missionProgressLines(claim.missions, claim.progress).join("\n")}\n` +
                `🎯 ${reward.toLocaleString()} points · ends <t:${Math.floor(claim.expiresAt.getTime() / 1000)}:R>`,
        });
    }

    await interaction.editReply({ embeds: [embed] });
};
