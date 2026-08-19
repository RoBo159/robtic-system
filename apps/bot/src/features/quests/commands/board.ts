import { EmbedBuilder, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_MESSAGES, QUEST_TIERS, TIER_SLOT, type QuestTier } from "@constants";
import { QuestRepository, QuestClaimRepository } from "@database/repositories";
import { isVipMember } from "../functions/is-vip";
import { tierTitle } from "../utils/quest-lines";

/** Everything claimable in this guild right now, annotated with what this member can do about it. */
export const board: FeatureSubcommandHandler = async (interaction, _client) => {
    const text = QUEST_MESSAGES.board;
    const guildId = interaction.guildId!;
    const member = interaction.member as GuildMember | null;

    const [quests, claims] = await Promise.all([
        QuestRepository.findOpen(guildId),
        QuestClaimRepository.findActiveForMember(guildId, interaction.user.id),
    ]);

    if (quests.length === 0) {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(text.title)
                .setColor(COLORS.info)
                .setDescription(text.empty)],
        });
        return;
    }

    const isVip = member ? await isVipMember(member) : false;
    const heldQuestIds = new Set(claims.map(claim => String(claim.questId)));
    const busySlots = new Set(claims.map(claim => claim.slot));

    // Display order is tier order, not generation order: a member scanning the board wants the
    // rare ones to sit where they expect them, not wherever the scheduler happened to fire.
    const ordered = [...quests].sort(
        (a, b) => QUEST_TIERS.indexOf(a.tier as QuestTier) - QUEST_TIERS.indexOf(b.tier as QuestTier)
    );

    const embed = new EmbedBuilder()
        .setTitle(text.title)
        .setColor(COLORS.activity)
        .setFooter({ text: text.footer });

    for (const quest of ordered.slice(0, 20)) {
        const tier = quest.tier as QuestTier;

        const status = heldQuestIds.has(String(quest._id))
            ? text.status.claimed
            : tier === "vip" && !isVip
                ? text.status.vipOnly
                : quest.slotsRemaining <= 0
                    ? text.status.full
                    : busySlots.has(TIER_SLOT[tier])
                        ? text.status.slotBusy
                        : text.status.open;

        const slots = quest.slotsTotal === null
            ? text.slotsUnlimited
            : text.slotsLeft(quest.slotsRemaining, quest.slotsTotal);

        const link = quest.channelId && quest.messageId
            ? text.link(guildId, quest.channelId, quest.messageId)
            : "";

        embed.addFields({
            name: text.questField(tierTitle(tier), quest.reward),
            value:
                `${quest.missions.map(mission => text.objective(mission.label)).join("\n")}\n` +
                text.questMeta(status, slots, quest.endsAt, link),
        });
    }

    await interaction.editReply({ embeds: [embed] });
};
