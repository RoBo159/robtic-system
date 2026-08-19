import { EmbedBuilder } from "discord.js";
import { COLORS, QUEST_MESSAGES, type QuestTier } from "@constants";
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
    const text = QUEST_MESSAGES.active;
    const claims = await QuestClaimRepository.findActiveForMember(guildId, discordId);

    if (claims.length === 0) {
        return new EmbedBuilder()
            .setTitle(text.title)
            .setColor(COLORS.info)
            .setDescription(text.empty);
    }

    const embed = new EmbedBuilder()
        .setTitle(text.title)
        .setColor(COLORS.activity)
        .setFooter({ text: text.footer });

    let totalReward = 0;

    for (const claim of claims) {
        const quest = await QuestRepository.findById(claim.questId);
        const reward = quest?.reward ?? 0;
        totalReward += reward;

        const done = claim.missions.filter(
            mission => (claim.progress?.[mission.missionId] ?? 0) >= mission.target
        ).length;

        embed.addFields({
            name: text.questField(tierTitle(claim.tier as QuestTier), done, claim.missions.length),
            value:
                `${missionProgressLines(claim.missions, claim.progress).join("\n")}\n` +
                text.questMeta(reward, claim.expiresAt),
        });
    }

    embed.setDescription(text.summary(claims.length, totalReward));

    return embed;
}
