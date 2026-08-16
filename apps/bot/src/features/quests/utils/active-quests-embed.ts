import { EmbedBuilder } from "discord.js";
import { COLORS, type QuestTier } from "@constants";
import { QuestClaimRepository, QuestRepository } from "@database/repositories";
import { tierTitle, missionProgressLines } from "./quest-lines";

/**
 * Everything a member is currently working on, with progress.
 *
 * Shared by `/quest active` and a bare `?quest`, because those are the same question asked two
 * ways — and the second is how most people will ask it, since it is what they typed to find the
 * quest in the first place.
 *
 * At most three claims exist per member (one per slot), so each quest is fetched individually
 * rather than aggregated.
 */
export async function buildActiveQuestsEmbed(guildId: string, discordId: string): Promise<EmbedBuilder> {
    const claims = await QuestClaimRepository.findActiveForMember(guildId, discordId);

    if (claims.length === 0) {
        return new EmbedBuilder()
            .setTitle("🗺️ Your quests")
            .setColor(COLORS.info)
            .setDescription(
                "Nothing claimed right now.\n" +
                "Quests appear in the quest channel — hit **Claim** on one and progress tracks itself."
            );
    }

    const embed = new EmbedBuilder()
        .setTitle("🗺️ Your quests")
        .setColor(COLORS.activity)
        .setFooter({ text: "Progress updates on its own · you are told by DM when one finishes or ends" });

    let totalReward = 0;

    for (const claim of claims) {
        const quest = await QuestRepository.findById(claim.questId);
        const reward = quest?.reward ?? 0;
        totalReward += reward;

        const done = claim.missions.filter(
            mission => (claim.progress?.[mission.missionId] ?? 0) >= mission.target
        ).length;

        embed.addFields({
            name: `${tierTitle(claim.tier as QuestTier)} — ${done}/${claim.missions.length} done`,
            value:
                `${missionProgressLines(claim.missions, claim.progress).join("\n")}\n` +
                `🎯 **${reward.toLocaleString()}** points · ends <t:${Math.floor(claim.expiresAt.getTime() / 1000)}:R>`,
        });
    }

    embed.setDescription(
        `**${claims.length}** quest${claims.length === 1 ? "" : "s"} in progress · ` +
        `**${totalReward.toLocaleString()}** points on the table`
    );

    return embed;
}
