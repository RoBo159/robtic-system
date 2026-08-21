import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_COMMUNITY_MESSAGES } from "@constants";
import { CommunityChallengeRepository, QuestSettingsRepository } from "@database/repositories";
import { pendingTotal } from "@core/quests";
import { buildCommunityEmbed } from "../utils/community-embed";

/**
 * A snapshot of the week's challenge, with this member's own share.
 *
 * The same renderer as the live panel, so the two can never drift apart — this adds the personal
 * fields the shared embed has no business carrying.
 */
export const community: FeatureSubcommandHandler = async (interaction, _client) => {
    const text = QUEST_COMMUNITY_MESSAGES;
    const guildId = interaction.guildId!;
    const challenge = await CommunityChallengeRepository.findActive(guildId);

    if (!challenge) {
        const settings = await QuestSettingsRepository.getCached(guildId);

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(text.title)
                .setColor(COLORS.info)
                .setDescription(settings.communityEnabled ? text.noneRunning : text.disabled)],
        });
        return;
    }

    const [mine, top, contributors] = await Promise.all([
        CommunityChallengeRepository.contributionFor(guildId, challenge.weekKey, interaction.user.id),
        CommunityChallengeRepository.topContributors(guildId, challenge.weekKey, 5),
        CommunityChallengeRepository.countContributors(guildId, challenge.weekKey),
    ]);

    const embed = buildCommunityEmbed({ challenge, pending: pendingTotal(guildId), top });

    const amount = mine?.amount ?? 0;
    embed.addFields({
        name: text.yourContributionField,
        value: amount >= challenge.minContribution
            ? text.yourContributionQualified(amount)
            : text.yourContributionShort(amount, challenge.minContribution - amount),
        inline: true,
    });

    embed.addFields({ name: text.contributorsField, value: contributors.toLocaleString(), inline: true });

    await interaction.editReply({ embeds: [embed] });
};
