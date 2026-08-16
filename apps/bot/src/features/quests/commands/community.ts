import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
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
    const guildId = interaction.guildId!;
    const challenge = await CommunityChallengeRepository.findActive(guildId);

    if (!challenge) {
        const settings = await QuestSettingsRepository.getCached(guildId);

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle("🌍 Weekly Community Challenge")
                .setColor(COLORS.info)
                .setDescription(settings.communityEnabled
                    ? "No challenge is running. A new one opens at the start of the week."
                    : "Community challenges are switched off in this server.")],
        });
        return;
    }

    const [mine, top, contributors] = await Promise.all([
        CommunityChallengeRepository.contributionFor(guildId, challenge.weekKey, interaction.user.id),
        CommunityChallengeRepository.topContributors(guildId, challenge.weekKey, 5),
        CommunityChallengeRepository.countContributors(guildId, challenge.weekKey),
    ]);

    // Buffered contribution is added in so the number here matches the live panel rather than
    // trailing it by up to a flush interval.
    const embed = buildCommunityEmbed({ challenge, pending: pendingTotal(guildId), top });

    const amount = mine?.amount ?? 0;
    embed.addFields({
        name: "Your contribution",
        value: amount >= challenge.minContribution
            ? `${amount.toLocaleString()} — you qualify for the reward`
            : `${amount.toLocaleString()} — ${(challenge.minContribution - amount).toLocaleString()} more to qualify`,
        inline: true,
    });

    embed.addFields({ name: "Contributors", value: contributors.toLocaleString(), inline: true });

    await interaction.editReply({ embeds: [embed] });
};
